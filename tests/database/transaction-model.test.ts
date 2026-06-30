import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { runMigrations } from '../../src/infrastructure/storage/knex/auto-migrate';
import { createKnexInstance } from '../../src/infrastructure/storage/knex/create-knex';
import { isEncrypted, PayloadCipher } from '../../src/infrastructure/storage/knex/encryption';
import { runWithLogSource } from '../../src/infrastructure/storage/knex/log-context';
import { Transaction } from '../../src/infrastructure/storage/knex/models/transaction';
import { TransactionLog } from '../../src/infrastructure/storage/knex/models/transaction-log';

let db: Knex;
let transactions: Transaction;
let logs: TransactionLog;

beforeEach(async () => {
  db = createKnexInstance({ client: 'better-sqlite3', connection: { filename: ':memory:' } });
  await runMigrations(db, DEFAULT_TABLES);
  transactions = new Transaction(db, DEFAULT_TABLES, new PayloadCipher('app-key'));
  logs = new TransactionLog(db, DEFAULT_TABLES);
});

afterEach(async () => {
  await db.destroy();
});

async function createTransaction() {
  return transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount: '1500.50',
    currency: '132',
    transactionCode: '1',
    payload: { posID: '90051', fingerprint: 'fp' },
    locale: 'pt',
  });
}

describe('Transaction', () => {
  it('creates pending transactions with canonical cents and encrypted payload', async () => {
    const transaction = await createTransaction();

    expect(transaction.status).toBe('pending');
    expect(transaction.amount).toBe(1500.5);
    expect(transaction.amount_cents).toBe(150050);
    expect(transaction.payload).toEqual({ posID: '90051', fingerprint: 'fp' });

    const raw = await db(DEFAULT_TABLES.transactions).where('id', transaction.id).first();

    expect(isEncrypted(raw.payload)).toBe(true);
    expect(raw.amount).toBeUndefined();
  });

  it('derives the public amount from canonical cents', async () => {
    const transaction = await transactions.create({
      merchantRef: 'R20260612100001',
      merchantSession: 'S20260612100001',
      amount: '8.0295',
    });

    expect(transaction.amount_cents).toBe(803);
    expect(transaction.amount).toBe(8.03);
  });

  it('finds transactions by ref and session', async () => {
    const transaction = await createTransaction();

    const found = await transactions.findByRefAndSession('R20260612100000', 'S20260612100000');

    expect(found?.id).toBe(transaction.id);
    expect(await transactions.findByRefAndSession('R20260612100000', 'other')).toBeNull();
    expect((await transactions.findByRef('R20260612100000'))?.id).toBe(transaction.id);
  });

  it('appends a transaction log for every change with old and new values', async () => {
    const transaction = await createTransaction();

    await runWithLogSource('callback', () =>
      transactions.update(transaction.id, {
        status: 'completed',
        transaction_id: 'TID-1',
        message_type: '8',
      }),
    );

    const entries = await logs.listByTransaction(transaction.id);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toBe('callback');
    expect(entries[0]?.changed_attributes).toEqual(
      expect.arrayContaining(['status', 'transaction_id', 'message_type']),
    );
    expect(entries[0]?.old_values).toMatchObject({ status: 'pending', transaction_id: null });
    expect(entries[0]?.new_values).toMatchObject({ status: 'completed', transaction_id: 'TID-1' });
  });

  it('serializes concurrent updates before diffing transaction logs', async () => {
    const transaction = await createTransaction();

    await Promise.all([
      transactions.update(transaction.id, { status: 'completed' }),
      transactions.update(transaction.id, { status: 'failed' }),
    ]);

    const entries = await logs.listByTransaction(transaction.id);

    expect(entries).toHaveLength(2);

    const firstNewValues = entries[0]?.new_values;

    if (firstNewValues === null || typeof firstNewValues !== 'object') {
      throw new Error('Expected the first transaction log to have new values.');
    }

    expect(entries[0]?.old_values).toMatchObject({ status: 'pending' });
    expect(entries[1]?.old_values).toMatchObject({
      status: firstNewValues.status,
    });
  });

  it('defaults the log source to model outside a context', async () => {
    const transaction = await createTransaction();

    await transactions.update(transaction.id, { status: 'failed' });

    const entries = await logs.listByTransaction(transaction.id);

    expect(entries[0]?.source).toBe('model');
  });

  it('ignores updates that change nothing', async () => {
    const transaction = await createTransaction();

    const unchanged = await transactions.update(transaction.id, {
      status: 'pending',
      transaction_id: null,
    });

    expect(unchanged.updated_at).toBe(transaction.updated_at);
    expect(await logs.listByTransaction(transaction.id)).toHaveLength(0);
  });

  it('recomputes amount_cents when the amount changes', async () => {
    const transaction = await createTransaction();

    const updated = await transactions.update(transaction.id, { amount: '8.03' });

    expect(updated.amount).toBe(8.03);
    expect(updated.amount_cents).toBe(803);

    const entries = await logs.listByTransaction(transaction.id);

    expect(entries[0]?.changed_attributes).toEqual(
      expect.arrayContaining(['amount', 'amount_cents']),
    );
  });

  it('re-encrypts payload changes and logs the decrypted values', async () => {
    const transaction = await createTransaction();

    await transactions.update(transaction.id, { payload: { posID: '90051', refunds: [1] } });

    const updated = await transactions.findById(transaction.id);

    expect(updated?.payload).toEqual({ posID: '90051', refunds: [1] });

    const entries = await logs.listByTransaction(transaction.id);

    expect(entries[0]?.new_values).toMatchObject({ payload: { posID: '90051', refunds: [1] } });
  });
});
