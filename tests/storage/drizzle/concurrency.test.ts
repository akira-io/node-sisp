import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { SispStorage } from '../../../src/core/contracts/storage';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';

const dir = mkdtempSync(join(tmpdir(), 'sisp-drizzle-concurrency-'));

async function makeStorage(): Promise<SispStorage> {
  const storage = createDrizzleStorage(
    drizzle(new Database(join(dir, `${process.hrtime.bigint()}.db`))),
    DEFAULT_TABLES,
    'app-key',
    { dialect: 'sqlite', autoMigrate: true },
  );

  await storage.migrate?.();

  return storage;
}

describe('DrizzleStorage (sqlite) under concurrency', () => {
  let storage: SispStorage;

  beforeEach(async () => {
    storage = await makeStorage();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('completes two updates started in the same tick', async () => {
    const first = await storage.transactions.create({
      merchantRef: 'REF-CONCURRENT-A',
      merchantSession: 'SES-CONCURRENT-A',
      amount: 100,
    });
    const second = await storage.transactions.create({
      merchantRef: 'REF-CONCURRENT-B',
      merchantSession: 'SES-CONCURRENT-B',
      amount: 200,
    });

    const outcomes = await Promise.allSettled([
      storage.transactions.update(first.id, { status: 'completed' }),
      storage.transactions.update(second.id, { status: 'completed' }),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
    expect((await storage.transactions.findById(first.id))?.status).toBe('completed');
    expect((await storage.transactions.findById(second.id))?.status).toBe('completed');
  });

  it('keeps a write issued outside a unit of work that rolls back', async () => {
    const transaction = await storage.transactions.create({
      merchantRef: 'REF-CONCURRENT-ROLLBACK',
      merchantSession: 'SES-CONCURRENT-ROLLBACK',
      amount: 300,
    });

    const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

    await Promise.allSettled([
      storage.transaction(async (unit) => {
        await unit.transactionItems.createMany(transaction.id, [
          { productName: 'in-unit', quantity: 1, unitPrice: 1, totalPrice: 1 },
        ]);
        await tick();

        throw new Error('roll this back');
      }),
      (async () => {
        await tick();

        return storage.transactionItems.createMany(transaction.id, [
          { productName: 'outside-unit', quantity: 1, unitPrice: 2, totalPrice: 2 },
        ]);
      })(),
    ]);

    const items = await storage.transactionItems.listByTransaction(transaction.id);

    expect(items.map((item) => item.product_name)).toEqual(['outside-unit']);
  });

  it('counts every hit when rate limit checks start in the same tick', async () => {
    const params = {
      identifier: '203.0.113.9',
      limitType: 'payment',
      limit: 3,
      windowSeconds: 60,
    };

    const blocked = await Promise.all([
      storage.rateLimits.hit(params),
      storage.rateLimits.hit(params),
      storage.rateLimits.hit(params),
      storage.rateLimits.hit(params),
    ]);

    expect(blocked).toEqual([false, false, false, true]);
  });
});
