import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import { createPrismaStorage } from '../../../src/infrastructure/storage/prisma';
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

function transactionOptionsOf(client: PrismaClientLike): Record<string, unknown> {
  const [, options] = (client.$transaction as unknown as { mock: { calls: unknown[][] } }).mock
    .calls[0] as [unknown, Record<string, unknown>];

  return options;
}

describe('prisma rate limit first-hit race', () => {
  it('counts the hit when a concurrent insert wins the race on postgres', async () => {
    const { client, rateLimits, rows } = racingClient({ abortsOnError: true });

    await expect(repositoryFor('postgresql', client).hit(HIT)).resolves.toBe(false);

    expect(rows[0]?.hits).toBe(1);
    expect(rateLimits.create).not.toHaveBeenCalled();
    expect(rateLimits.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ identifier: HIT.identifier })],
      skipDuplicates: true,
    });
  });

  it('locks the row before incrementing it', async () => {
    const { client, rows } = racingClient({ abortsOnError: true });

    await repositoryFor('postgresql', client).hit(HIT);

    const raw = client.$queryRawUnsafe as unknown as { mock: { calls: unknown[][] } };
    const [sql, value] = raw.mock.calls[0] as [string, unknown];

    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('"sisp_rate_limits"');
    expect(value).toBe(rows[0]?.id);
  });

  it('blocks the identifier once the hits pass the limit', async () => {
    const { client, rows } = racingClient({ abortsOnError: true });
    const repository = repositoryFor('postgresql', client);

    for (let i = 0; i < HIT.limit; i += 1) {
      expect(await repository.hit(HIT)).toBe(false);
    }

    expect(await repository.hit(HIT)).toBe(true);
    expect(rows[0]?.hits).toBe(HIT.limit + 1);
    expect(rows[0]?.isBlocked).toBe(true);
    expect(await repository.hit(HIT)).toBe(true);
  });

  it.each([
    'mysql',
    'sqlite',
  ] as const)('keeps the typed unique-violation catch on %s, where a failed statement does not abort the transaction', async (provider) => {
    const { client, rateLimits } = racingClient({ abortsOnError: false });

    await expect(repositoryFor(provider, client).hit(HIT)).resolves.toBe(false);

    expect(rateLimits.createMany).not.toHaveBeenCalled();
    expect(rateLimits.create).toHaveBeenCalledOnce();
  });

  it.each([
    'mysql',
    'sqlite',
  ] as const)('rethrows an insert failure on %s that is not a unique violation', async (provider) => {
    const { client, rateLimits } = racingClient({ abortsOnError: false });

    rateLimits.create.mockRejectedValueOnce(
      Object.assign(new Error('data too long for column identifier'), { code: 'ER_DATA_TOO_LONG' }),
    );

    await expect(repositoryFor(provider, client).hit(HIT)).rejects.toThrow('data too long');
  });

  it('refuses to report a miss when the row can be neither read nor created', async () => {
    const { client, rateLimits } = racingClient({ abortsOnError: false });

    rateLimits.findFirst.mockResolvedValue(null);

    await expect(repositoryFor('postgresql', client).hit(HIT)).rejects.toThrow(
      'could not be read or created',
    );
  });

  it('opens the interactive transaction with an explicit timeout above the prisma default', async () => {
    const { client } = racingClient({ abortsOnError: true });

    await repositoryFor('postgresql', client).hit(HIT);

    expect(transactionOptionsOf(client)).toEqual({ maxWait: 5_000, timeout: 20_000 });
  });

  it('honours the transactionOptions given to createPrismaStorage', async () => {
    const { client } = racingClient({ abortsOnError: true });
    const storage = createPrismaStorage(client, DEFAULT_TABLES, null, {
      provider: 'postgresql',
      transactionOptions: { timeout: 45_000 },
    });

    await storage.rateLimits.hit(HIT);

    expect(transactionOptionsOf(client)).toEqual({ maxWait: 5_000, timeout: 45_000 });
  });

  it('keeps the defaults when an override is present but undefined', async () => {
    const { client } = racingClient({ abortsOnError: true });
    const storage = createPrismaStorage(client, DEFAULT_TABLES, null, {
      provider: 'postgresql',
      transactionOptions: { timeout: undefined },
    });

    await storage.rateLimits.hit(HIT);

    expect(transactionOptionsOf(client)).toEqual({ maxWait: 5_000, timeout: 20_000 });
  });
});
