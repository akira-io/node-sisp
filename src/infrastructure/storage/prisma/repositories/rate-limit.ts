import type { SispTables } from '../../../../application/config';
import type { RateLimitRepository } from '../../../../core/contracts/storage';
import type { RateLimitHit } from '../../../../domain/storage-types';
import { nowIso } from '../../knex/records';
import {
  DELEGATE_NAMES,
  delegate,
  type PrismaClientLike,
  rawExec,
  runInTransaction,
} from '../client';
import { lockRowForUpdate } from '../locking';
import type { PrismaRow } from '../mapping';
import type { PrismaSqlProvider } from '../prisma-storage';

interface RateLimitRow {
  id: bigint | number;
  hits: number;
  limit: number;
  windowSeconds: number;
  resetAt: Date | string;
  isBlocked: boolean | number;
  blockedUntil: Date | string | null;
}

function futureIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function parseResetAt(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  return Date.parse(String(value));
}

function isCurrentlyBlocked(row: RateLimitRow): boolean {
  if (!row.isBlocked) {
    return false;
  }

  if (row.blockedUntil === null || row.blockedUntil === undefined) {
    return true;
  }

  const until =
    row.blockedUntil instanceof Date
      ? row.blockedUntil.getTime()
      : Date.parse(String(row.blockedUntil));

  return until > Date.now();
}

export function makeRateLimitRepository(
  client: PrismaClientLike,
  tables: SispTables,
  provider: PrismaSqlProvider,
): RateLimitRepository {
  return {
    async hit(params: RateLimitHit): Promise<boolean> {
      return runInTransaction(client, async (txc) => {
        const model = () => delegate(txc, DELEGATE_NAMES.rateLimits);
        const filter: Record<string, unknown> = {
          identifier: params.identifier,
          limitType: params.limitType,
          context: params.context ?? null,
        };

        let existing = await model().findFirst({ where: filter });

        if (!existing) {
          const timestamp = nowIso();

          await model().create({
            data: {
              ...filter,
              hits: 0,
              limit: params.limit,
              windowSeconds: params.windowSeconds,
              resetAt: new Date(futureIso(params.windowSeconds)),
              isBlocked: false,
              createdAt: new Date(timestamp),
              updatedAt: new Date(timestamp),
            },
          });

          existing = await model().findFirst({ where: filter });
        }

        if (!existing) {
          return false;
        }

        await lockRowForUpdate(rawExec(txc), provider, tables.rateLimits, 'id', existing.id);

        const locked = await model().findFirst({ where: { id: existing.id } });

        if (!locked) {
          return false;
        }

        let row = locked as unknown as RateLimitRow;

        if (parseResetAt(row.resetAt) <= Date.now()) {
          const reset: PrismaRow = {
            hits: 0,
            resetAt: new Date(futureIso(params.windowSeconds)),
            isBlocked: false,
            blockedUntil: null,
            updatedAt: new Date(nowIso()),
          };

          await model().update({
            where: { id: row.id },
            data: reset,
          });

          row = { ...row, hits: 0, isBlocked: false, blockedUntil: null };
        }

        if (isCurrentlyBlocked(row)) {
          return true;
        }

        const hits = Number(row.hits) + 1;

        await model().update({
          where: { id: row.id },
          data: { hits, updatedAt: new Date(nowIso()) },
        });

        if (hits > params.limit) {
          await model().update({
            where: { id: row.id },
            data: {
              isBlocked: true,
              blockedUntil: new Date(futureIso(params.windowSeconds)),
              updatedAt: new Date(nowIso()),
            },
          });

          return true;
        }

        return false;
      });
    },
  };
}
