import type { Knex } from 'knex';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { runMigrations } from '../../src/infrastructure/storage/knex/auto-migrate';
import { createKnexInstance } from '../../src/infrastructure/storage/knex/create-knex';
import { PayloadCipher } from '../../src/infrastructure/storage/knex/encryption';
import { DEFAULT_LIST_BY_TRANSACTION_LIMIT } from '../../src/infrastructure/storage/knex/list-options';
import { Transaction } from '../../src/infrastructure/storage/knex/models/transaction';

let db: Knex;
let transactions: Transaction;

beforeEach(async () => {
  db = createKnexInstance({ client: 'better-sqlite3', connection: { filename: ':memory:' } });
  await runMigrations(db, DEFAULT_TABLES);
  transactions = new Transaction(db, DEFAULT_TABLES, new PayloadCipher('app-key'));
});

afterEach(async () => {
  await db.destroy();
});

async function seed(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await transactions.create({
      merchantRef: `R${index}`,
      merchantSession: `S${index}`,
      amount: 1500,
    });
  }
}

it('lists transactions newest first and hydrates the amount', async () => {
  await seed(3);

  const rows = await transactions.list();

  expect(rows.map((row) => row.merchant_ref)).toEqual(['R2', 'R1', 'R0']);
  expect(rows[0]?.amount).toBe(1500);
  expect(rows[0]?.amount_cents).toBe(150000);
});

it('honours ascending order, limit, and offset', async () => {
  await seed(5);

  const rows = await transactions.list({ order: 'asc', limit: 2, offset: 1 });

  expect(rows.map((row) => row.merchant_ref)).toEqual(['R1', 'R2']);
});

it('caps the limit at the configured maximum', async () => {
  await seed(2);

  const rows = await transactions.list({ limit: 10_000 });

  expect(rows).toHaveLength(2);
  expect(DEFAULT_LIST_BY_TRANSACTION_LIMIT).toBe(100);
});

it('filters by status', async () => {
  await seed(2);
  const all = await transactions.list();
  await transactions.update(all[0]!.id, { status: 'completed' });

  const completed = await transactions.list({ status: 'completed' });

  expect(completed).toHaveLength(1);
  expect(completed[0]?.status).toBe('completed');
});
