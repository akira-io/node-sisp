import type { SispTables } from '../../../../application/config';
import type { RateLimitRepository } from '../../../../core/contracts/storage';
import type { RateLimitHit } from '../../../../domain/storage-types';
import { isUniqueConstraintError } from '../../../../support/database-errors';
import { nowIso } from '../../knex/records';
import {
  DELEGATE_NAMES,
  delegate,
  type PrismaClientLike,
  type PrismaDelegate,
  type PrismaTransactionOptions,
  rawExec,
  runInTransaction,
} from '../client';
import { type LockColumn, selectForUpdate } from '../locking';
import type { PrismaRow } from '../mapping';
import type { PrismaSqlProvider } from '../prisma-storage';
import { mapRateLimitRow, type RateLimitRow } from '../rate-limit-row';

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

interface RateLimitKeyPart {
  camelCase: string;
  snakeCase: string;
  value: unknown;
}

function rateLimitKey(params: RateLimitHit): RateLimitKeyPart[] {
  return [
    { camelCase: 'identifier', snakeCase: 'identifier', value: params.identifier },
    { camelCase: 'limitType', snakeCase: 'limit_type', value: params.limitType },
    { camelCase: 'context', snakeCase: 'context', value: params.context ?? '' },
  ];
}

function keyFilter(key: RateLimitKeyPart[]): Record<string, unknown> {
  return Object.fromEntries(key.map((part) => [part.camelCase, part.value]));
}

function keyLockColumns(key: RateLimitKeyPart[]): LockColumn[] {
  return key.map((part) => ({ column: part.snakeCase, value: part.value }));
}

async function insertIgnoringConflicts(
  model: PrismaDelegate,
  provider: PrismaSqlProvider,
  data: Record<string, unknown>,
): Promise<void> {
  if (provider === 'postgresql') {
    await model.createMany({ data: [data], skipDuplicates: true });

    return;
  }

  try {
    await model.create({ data });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }
}

export function makeRateLimitRepository(
  client: PrismaClientLike,
  tables: SispTables,
  provider: PrismaSqlProvider,
  txOptions?: PrismaTransactionOptions,
): RateLimitRepository {
  return {
    async hit(params: RateLimitHit): Promise<boolean> {
      return runInTransaction(
        client,
        async (txc) => {
          const model = () => delegate(txc, DELEGATE_NAMES.rateLimits);
          const key = rateLimitKey(params);
          const filter = keyFilter(key);

          const existing = await model().findFirst({ where: filter });

          if (!existing) {
            const timestamp = nowIso();

            await insertIgnoringConflicts(model(), provider, {
              ...filter,
              hits: 0,
              limit: params.limit,
              windowSeconds: params.windowSeconds,
              resetAt: new Date(futureIso(params.windowSeconds)),
              isBlocked: false,
              createdAt: new Date(timestamp),
              updatedAt: new Date(timestamp),
            });
          }

          const lockColumns = keyLockColumns(key);

          const [lockedRow] = await selectForUpdate(
            rawExec(txc),
            provider,
            tables.rateLimits,
            lockColumns,
          );

          if (lockedRow === undefined) {
            throw new Error(
              `Rate limit row for ${params.limitType}:${params.identifier} could not be read or created.`,
            );
          }

          let row = mapRateLimitRow(lockedRow);

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
        },
        txOptions,
      );
    },
  };
}
