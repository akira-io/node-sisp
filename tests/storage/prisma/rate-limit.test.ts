import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { PrismaClientLike } from '../../../src/infrastructure/storage/prisma/client';
import type { PrismaSqlProvider } from '../../../src/infrastructure/storage/prisma/prisma-storage';
import { makeRateLimitRepository } from '../../../src/infrastructure/storage/prisma/repositories/rate-limit';

const HIT = { identifier: '203.0.113.9', limitType: 'ip', limit: 5, windowSeconds: 60 };

function uniqueViolation(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function abortedTransaction(): Error {
  return Object.assign(new Error('current transaction is aborted'), { code: '25P02' });
}

interface StoredRow extends Record<string, unknown> {
  id: bigint;
  identifier: string;
  limitType: string;
  context: string;
}

function sameKey(row: StoredRow, where: Record<string, unknown>): boolean {
  if (where.id !== undefined) {
    return row.id === where.id;
  }

  return (
    row.identifier === where.identifier &&
    row.limitType === where.limitType &&
    row.context === where.context
  );
}

function racingClient(options: { abortsOnError: boolean }) {
  const rows: StoredRow[] = [
    {
      id: 1n,
      identifier: HIT.identifier,
      limitType: HIT.limitType,
      context: '',
      hits: 0,
      limit: HIT.limit,
      windowSeconds: HIT.windowSeconds,
      resetAt: new Date(Date.now() + 60_000),
      isBlocked: false,
      blockedUntil: null,
    },
  ];

  let aborted = false;
  let snapshotTaken = false;

  function guard(): void {
    if (aborted) {
      throw abortedTransaction();
    }
  }

  function fail(): never {
    if (options.abortsOnError) {
      aborted = true;
    }

    throw uniqueViolation();
  }

  const rateLimits = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      guard();

      if (!snapshotTaken) {
        snapshotTaken = true;

        return null;
      }

      return rows.find((row) => sameKey(row, where)) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      guard();

      if (rows.some((row) => sameKey(row, data))) {
        fail();
      }

      rows.push(data as StoredRow);

      return data;
    }),
    createMany: vi.fn(
      async ({
        data,
        skipDuplicates,
      }: {
        data: Record<string, unknown>[];
        skipDuplicates?: boolean;
      }) => {
        guard();

        let count = 0;

        for (const row of data) {
          if (rows.some((stored) => sameKey(stored, row))) {
            if (skipDuplicates !== true) {
              fail();
            }

            continue;
          }

          rows.push(row as StoredRow);
          count += 1;
        }

        return { count };
      },
    ),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
      guard();

      const row = rows.find((candidate) => sameKey(candidate, where));

      Object.assign(row as StoredRow, data);

      return row as StoredRow;
    }),
  };

  const client = {
    $queryRawUnsafe: vi.fn(async () => {
      guard();

      return [];
    }),
    $transaction: vi.fn(async (work: (txc: PrismaClientLike) => Promise<unknown>) => work(client)),
    sispRateLimit: rateLimits,
  } as unknown as PrismaClientLike & { sispRateLimit: typeof rateLimits };

  return { client, rateLimits, rows };
}

function repositoryFor(provider: PrismaSqlProvider, client: PrismaClientLike) {
  return makeRateLimitRepository(client, DEFAULT_TABLES, provider);
}

describe('prisma rate limit first-hit race', () => {
  it('counts the hit when a concurrent insert wins the race on postgres', async () => {
    const { client, rateLimits } = racingClient({ abortsOnError: true });

    await expect(repositoryFor('postgresql', client).hit(HIT)).resolves.toBe(false);

    expect(rateLimits.create).not.toHaveBeenCalled();
    expect(rateLimits.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ identifier: HIT.identifier })],
      skipDuplicates: true,
    });
  });

  it('counts the hit when a concurrent insert wins the race on mysql', async () => {
    const { client, rateLimits } = racingClient({ abortsOnError: false });

    await expect(repositoryFor('mysql', client).hit(HIT)).resolves.toBe(false);

    expect(rateLimits.createMany).toHaveBeenCalledOnce();
  });

  it('falls back to a tolerated create on sqlite, which has no skipDuplicates', async () => {
    const { client, rateLimits } = racingClient({ abortsOnError: false });

    await expect(repositoryFor('sqlite', client).hit(HIT)).resolves.toBe(false);

    expect(rateLimits.createMany).not.toHaveBeenCalled();
    expect(rateLimits.create).toHaveBeenCalledOnce();
  });

  it('rethrows an insert failure that is not a unique violation', async () => {
    const { client, rateLimits } = racingClient({ abortsOnError: false });

    rateLimits.create.mockRejectedValueOnce(
      Object.assign(new Error('disk full'), { code: '53100' }),
    );

    await expect(repositoryFor('sqlite', client).hit(HIT)).rejects.toThrow('disk full');
  });

  it('opens the interactive transaction with an explicit timeout', async () => {
    const { client } = racingClient({ abortsOnError: true });

    await repositoryFor('postgresql', client).hit(HIT);

    const [, options] = (client.$transaction as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [unknown, { maxWait?: number; timeout?: number }];

    expect(options.timeout).toBeGreaterThan(5_000);
    expect(options.maxWait).toBeGreaterThan(0);
  });
});
