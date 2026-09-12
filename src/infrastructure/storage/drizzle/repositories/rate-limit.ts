import { and, eq } from 'drizzle-orm';
import type { RateLimitRepository } from '../../../../core/contracts/storage';
import type { RateLimitHit } from '../../../../domain/storage-types';
import { nowIso } from '../../knex/records';
import type { DrizzleRow } from '../client';
import { runInTransaction } from '../client';
import type { TableGateway } from '../queries';
import type { RepositoryContext } from './context';
import { gateway, scopedContext } from './context';

function futureIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function asTime(value: unknown): number {
  return value instanceof Date ? value.getTime() : Date.parse(String(value));
}

function isCurrentlyBlocked(row: DrizzleRow): boolean {
  if (!row.is_blocked) {
    return false;
  }

  if (row.blocked_until === null || row.blocked_until === undefined) {
    return true;
  }

  return asTime(row.blocked_until) > Date.now();
}

function filter(table: TableGateway, params: RateLimitHit) {
  return and(
    eq(table.column('identifier'), params.identifier),
    eq(table.column('limit_type'), params.limitType),
    eq(table.column('context'), params.context ?? ''),
  );
}

export function makeRateLimitRepository(context: RepositoryContext): RateLimitRepository {
  return {
    async hit(params: RateLimitHit): Promise<boolean> {
      return runInTransaction(context.connection, async (connection) => {
        const table = gateway(scopedContext(context, connection), 'rateLimits');
        const where = filter(table, params);

        let existing = await table.first(where);

        if (existing === null) {
          const timestamp = nowIso();

          await table.insertIgnoringConflicts({
            identifier: params.identifier,
            limit_type: params.limitType,
            context: params.context ?? '',
            hits: 0,
            limit: params.limit,
            window_seconds: params.windowSeconds,
            reset_at: futureIso(params.windowSeconds),
            is_blocked: false,
            created_at: timestamp,
            updated_at: timestamp,
          });

          existing = await table.first(where);
        }

        if (existing === null) {
          throw new Error(
            `Rate limit row for ${params.limitType}:${params.identifier} could not be read or created.`,
          );
        }

        const locked = await table.firstForUpdate(eq(table.column('id'), existing.id));

        if (locked === null) {
          return false;
        }

        let row = locked;

        if (asTime(row.reset_at) <= Date.now()) {
          await table.update(eq(table.column('id'), row.id), {
            hits: 0,
            reset_at: futureIso(params.windowSeconds),
            is_blocked: false,
            blocked_until: null,
            updated_at: nowIso(),
          });

          row = { ...row, hits: 0, is_blocked: false, blocked_until: null };
        }

        if (isCurrentlyBlocked(row)) {
          return true;
        }

        const hits = Number(row.hits) + 1;

        await table.update(eq(table.column('id'), row.id), { hits, updated_at: nowIso() });

        if (hits > params.limit) {
          await table.update(eq(table.column('id'), row.id), {
            is_blocked: true,
            blocked_until: futureIso(params.windowSeconds),
            updated_at: nowIso(),
          });

          return true;
        }

        return false;
      });
    },
  };
}
