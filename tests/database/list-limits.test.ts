import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { runMigrations } from '../../src/infrastructure/storage/knex/auto-migrate';
import { createKnexInstance } from '../../src/infrastructure/storage/knex/create-knex';
import { PayloadCipher } from '../../src/infrastructure/storage/knex/encryption';
import { DEFAULT_LIST_BY_TRANSACTION_LIMIT } from '../../src/infrastructure/storage/knex/list-options';
import { RequestMetadata } from '../../src/infrastructure/storage/knex/models/request-metadata';
import { Transaction } from '../../src/infrastructure/storage/knex/models/transaction';
import { TransactionAttempt } from '../../src/infrastructure/storage/knex/models/transaction-attempt';
import { TransactionItem } from '../../src/infrastructure/storage/knex/models/transaction-item';
import { TransactionLog } from '../../src/infrastructure/storage/knex/models/transaction-log';
import { nowIso, type TransactionRecord } from '../../src/infrastructure/storage/knex/records';

let db: Knex;
let transaction: Transaction;
let attempts: TransactionAttempt;
let items: TransactionItem;
let logs: TransactionLog;
let metadata: RequestMetadata;

beforeEach(async () => {
  db = createKnexInstance({ client: 'better-sqlite3', connection: { filename: ':memory:' } });
  await runMigrations(db, DEFAULT_TABLES);

  const cipher = new PayloadCipher('app-key');
  transaction = new Transaction(db, DEFAULT_TABLES, cipher);
  attempts = new TransactionAttempt(db, DEFAULT_TABLES, cipher);
  items = new TransactionItem(db, DEFAULT_TABLES);
  logs = new TransactionLog(db, DEFAULT_TABLES);
  metadata = new RequestMetadata(db, DEFAULT_TABLES);
});

afterEach(async () => {
  await db.destroy();
});

describe('transaction history list limits', () => {
  it('bounds transaction attempts, items, metadata, and logs by default', async () => {
    const record = await createTransaction();

    await seedAttempts(record);
    await seedItems(record);
    await seedMetadata(record);
    await seedLogs(record);

    expect(await attempts.listByTransaction(record.id)).toHaveLength(
      DEFAULT_LIST_BY_TRANSACTION_LIMIT,
    );
    expect(await items.listByTransaction(record.id)).toHaveLength(
      DEFAULT_LIST_BY_TRANSACTION_LIMIT,
    );
    expect(await metadata.listByTransaction(record.id)).toHaveLength(
      DEFAULT_LIST_BY_TRANSACTION_LIMIT,
    );
    expect(await logs.listByTransaction(record.id)).toHaveLength(DEFAULT_LIST_BY_TRANSACTION_LIMIT);
  });

  it('supports bounded descending lookups and offsets', async () => {
    const record = await createTransaction();

    await seedAttempts(record);
    await seedItems(record);

    const latestAttempts = await attempts.listByTransaction(record.id, { limit: 2, order: 'desc' });
    const itemPage = await items.listByTransaction(record.id, { limit: 2, offset: 100 });

    expect(latestAttempts.map((attempt) => attempt.attempt_number)).toEqual([105, 104]);
    expect(itemPage.map((item) => item.product_name)).toEqual(['Item 101', 'Item 102']);
    expect((await attempts.currentByTransaction(record.id))?.attempt_number).toBe(105);
    expect(await attempts.existsByTransaction(record.id)).toBe(true);
    expect(await attempts.existsByTransaction(record.id + 1)).toBe(false);
  });

  it('prunes transaction logs after the retention cap', async () => {
    const record = await createTransaction();

    for (let index = 0; index < DEFAULT_LIST_BY_TRANSACTION_LIMIT + 5; index++) {
      await transaction.update(record.id, { merchant_response: `message-${index}` });
    }

    const rows = await db(DEFAULT_TABLES.transactionLogs).where('transaction_id', record.id);

    expect(rows).toHaveLength(DEFAULT_LIST_BY_TRANSACTION_LIMIT);
    expect(await logs.listByTransaction(record.id, { limit: 200 })).toHaveLength(
      DEFAULT_LIST_BY_TRANSACTION_LIMIT,
    );
  });
});

async function createTransaction(): Promise<TransactionRecord> {
  return transaction.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount: 1500,
    payload: { posID: '90051' },
  });
}

async function seedAttempts(record: TransactionRecord): Promise<void> {
  const timestamp = nowIso();

  await db(DEFAULT_TABLES.transactionAttempts).insert(
    range(105).map((index) => ({
      transaction_id: record.id,
      attempt_number: index + 1,
      merchant_ref: `R-list-${index}`,
      merchant_session: `S-list-${index}`,
      status: 'pending',
      payload: null,
      created_at: timestamp,
      updated_at: timestamp,
    })),
  );
}

async function seedItems(record: TransactionRecord): Promise<void> {
  await items.createMany(
    record.id,
    range(105).map((index) => ({
      productName: `Item ${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
    })),
  );
}

async function seedMetadata(record: TransactionRecord): Promise<void> {
  for (const index of range(105)) {
    await metadata.create({
      transaction_id: record.id,
      ip_address: `10.0.0.${index}`,
    });
  }
}

async function seedLogs(record: TransactionRecord): Promise<void> {
  const timestamp = nowIso();

  await db(DEFAULT_TABLES.transactionLogs).insert(
    range(105).map((index) => ({
      transaction_id: record.id,
      source: 'test',
      changed_attributes: JSON.stringify(['merchant_response']),
      old_values: JSON.stringify({ merchant_response: `old-${index}` }),
      new_values: JSON.stringify({ merchant_response: `new-${index}` }),
      created_at: timestamp,
      updated_at: timestamp,
    })),
  );
}

function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}
