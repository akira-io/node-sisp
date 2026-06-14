import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/config';
import { runMigrations } from '../../src/database/auto-migrate';
import { createKnexInstance } from '../../src/database/create-knex';
import { isEncrypted, PayloadCipher } from '../../src/database/encryption';
import { runWithLogSource } from '../../src/database/log-context';
import { Transaction } from '../../src/database/models/transaction';
import { TransactionLog } from '../../src/database/models/transaction-log';

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
