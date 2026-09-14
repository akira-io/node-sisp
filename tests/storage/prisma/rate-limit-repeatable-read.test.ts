import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { PrismaClientLike } from '../../../src/infrastructure/storage/prisma/client';
import { makeRateLimitRepository } from '../../../src/infrastructure/storage/prisma/repositories/rate-limit';

const HIT = { identifier: '203.0.113.9', limitType: 'ip', limit: 5, windowSeconds: 60 };

interface StoredRow extends Record<string, unknown> {
  id: bigint;
  identifier: string;
  limitType: string;
  context: string;
}

function repeatableReadClient() {
  const rows: StoredRow[] = [];
  const raw = vi.fn();

  const rateLimits = {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      rows.push({ id: 1n, ...data } as StoredRow);

      return rows[0] as Record<string, unknown>;
    }),
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const entry of data) {
        rows.push({ id: 1n, ...entry } as StoredRow);
      }

      return { count: data.length };
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(rows[0] as StoredRow, data);

      return rows[0] as Record<string, unknown>;
    }),
  };

  const client = {
    sispRateLimit: rateLimits,
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      raw(sql);

      if (rows.length === 0) {
        return [];
      }

      const row = rows[0] as StoredRow;

      return [
        {
          id: row.id,
          identifier: row.identifier,
          limit_type: row.limitType,
          context: row.context,
          hits: row.hits,
          limit: row.limit,
          window_seconds: row.windowSeconds,
          reset_at: row.resetAt,
          is_blocked: row.isBlocked,
          blocked_until: row.blockedUntil,
        },
      ];
    }),
    $transaction: vi.fn(async (work: (txc: PrismaClientLike) => Promise<unknown>) => work(client)),
  } as unknown as PrismaClientLike;

  return { client, rows, raw, rateLimits };
}

describe('rate limit under REPEATABLE READ', () => {
  it('counts the first hit when findFirst still sees the pre-insert snapshot', async () => {
    const { client, rows, raw } = repeatableReadClient();
    const repository = makeRateLimitRepository(client, DEFAULT_TABLES, 'mysql');

    const blocked = await repository.hit(HIT);

    expect(blocked).toBe(false);
    expect(rows[0]?.hits).toBe(1);
    expect(raw.mock.calls[0]?.[0]).toContain('FOR UPDATE');
  });

  it('does not read the row through findFirst after the insert', async () => {
    const { client, rateLimits } = repeatableReadClient();
    const repository = makeRateLimitRepository(client, DEFAULT_TABLES, 'mysql');

    await repository.hit(HIT);

    expect(rateLimits.findFirst).toHaveBeenCalledTimes(1);
  });
});
