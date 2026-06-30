import { afterEach, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';

let sisp: Sisp;
afterEach(() => sisp.destroy());

it('uses an injected storage with no database config', async () => {
  const storage = KnexStorage.create(
    { client: 'better-sqlite3', connection: { filename: ':memory:' }, autoMigrate: true },
    DEFAULT_TABLES,
    'app-key',
  );
  await storage.migrate?.();
  sisp = await createSisp({ posId: '90051', posAutCode: 'X', appKey: 'app-key', storage });
  const tx = await sisp.models.transactions.create({
    merchantRef: 'R1',
    merchantSession: 'S1',
    amount: 1500,
  });
  expect((await sisp.models.transactions.findById(tx.id))?.amount).toBe(1500);
});

it('throws when neither storage nor database is provided', async () => {
  await expect(
    createSisp({ posId: '90051', posAutCode: 'X', appKey: 'app-key' } as never),
  ).rejects.toThrow('Either `storage` or `database` must be provided.');
});

it('throws when both storage and database are provided', async () => {
  const storage = KnexStorage.create(
    { client: 'better-sqlite3', connection: { filename: ':memory:' }, autoMigrate: true },
    DEFAULT_TABLES,
    'app-key',
  );
  await storage.migrate?.();
  await expect(
    createSisp({
      posId: '90051',
      posAutCode: 'X',
      appKey: 'app-key',
      storage,
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    }),
  ).rejects.toThrow('Provide either `storage` or `database`, not both.');
});
