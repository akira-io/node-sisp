import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailTransactionAction } from '../../src/actions/fail-transaction';
import { credentialsFromConfig, type ResolvedSispConfig, resolveConfig } from '../../src/config';
import { StaticCredentialsResolver } from '../../src/contracts/credentials-resolver';
import { runMigrations } from '../../src/database/auto-migrate';
import { createKnexInstance } from '../../src/database/create-knex';
import { PayloadCipher } from '../../src/database/encryption';
import { Transaction } from '../../src/database/models/transaction';
import { TransactionAttempt } from '../../src/database/models/transaction-attempt';
import { TransactionLog } from '../../src/database/models/transaction-log';
import { SispEventEmitter } from '../../src/events';
import { TransactionNotFoundError } from '../../src/exceptions';
import { generateCallbackFingerprint } from '../../src/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/fingerprints/token';
import { CallbackContext } from '../../src/pipelines/callback/callback-context';
import { HandleCallbackPipeline } from '../../src/pipelines/callback/handle-callback-pipeline';
import { ApplyTransactionStatus } from '../../src/pipelines/callback/pipes/apply-transaction-status';
import { DispatchPaymentEvents } from '../../src/pipelines/callback/pipes/dispatch-payment-events';
import { EnsureCallbackMatchesTransaction } from '../../src/pipelines/callback/pipes/ensure-callback-matches-transaction';
import { ResolveTransaction } from '../../src/pipelines/callback/pipes/resolve-transaction';
import { ValidateFingerprint } from '../../src/pipelines/callback/pipes/validate-fingerprint';
import { callbackPayloadFrom } from '../../src/value-objects/callback-payload';

const token = computeToken('TEST_POS_AUT_CODE');

let db: Knex;
let config: ResolvedSispConfig;
let transactions: Transaction;
let attempts: TransactionAttempt;
let logs: TransactionLog;
let events: SispEventEmitter;
let pipeline: HandleCallbackPipeline;

beforeEach(async () => {
  db = createKnexInstance({ client: 'better-sqlite3', connection: { filename: ':memory:' } });
  config = resolveConfig({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    appKey: 'app-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
  await runMigrations(db, config.tables);

  const cipher = new PayloadCipher(config.appKey);

  transactions = new Transaction(db, config.tables, cipher);
  attempts = new TransactionAttempt(db, config.tables, cipher);
  logs = new TransactionLog(db, config.tables);
  events = new SispEventEmitter();

  const credentialsResolver = new StaticCredentialsResolver(credentialsFromConfig(config));
  const failTransaction = new FailTransactionAction(db, transactions, attempts);

  pipeline = new HandleCallbackPipeline([
    new ResolveTransaction(db, transactions, attempts),
    new ValidateFingerprint(credentialsResolver, failTransaction, events),
    new EnsureCallbackMatchesTransaction(config, credentialsResolver, failTransaction, events),
    new ApplyTransactionStatus(db, transactions, attempts),
    new DispatchPaymentEvents(events),
  ]);
});

afterEach(async () => {
  await db.destroy();
});

async function createPendingTransaction(amount: number | string = '1500') {
  const transaction = await transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount,
    currency: '132',
    transactionCode: '1',
  });

  await attempts.createFromTransaction(transaction);

  return transaction;
}

function signedCallback(overrides: Record<string, unknown> = {}, omittedFields: string[] = []) {
  const post: Record<string, unknown> = {
    messageType: '8',
    merchantRespCP: '01',
    merchantRespTid: 'TID-12345',
    merchantRespMerchantRef: 'R20260612100000',
    merchantRespMerchantSession: 'S20260612100000',
    merchantRespPurchaseAmount: '1500',
    merchantResp: '00',
    merchantRespTimeStamp: '2026-06-12 10:00:05',
    posID: '90051',
    currency: '132',
    transactionCode: '1',
    ...overrides,
  };

  for (const field of omittedFields) {
    delete post[field];
  }

  const fingerprint = generateCallbackFingerprint(token, callbackPayloadFrom(post));

  return callbackPayloadFrom({ ...post, resultFingerPrint: fingerprint });
}

describe('HandleCallbackPipeline', () => {
  it('completes a pending transaction on a valid success callback', async () => {
    await createPendingTransaction();
    const completed = vi.fn();
    events.on('payment:completed', completed);

    const context = await pipeline.run(new CallbackContext(signedCallback()));

    expect(context.failed()).toBe(false);

    const transaction = context.requireTransaction();

    expect(transaction.status).toBe('completed');
    expect(transaction.transaction_id).toBe('TID-12345');
    expect(transaction.message_type).toBe('8');
    expect(completed).toHaveBeenCalledTimes(1);

    const entries = await logs.listByTransaction(transaction.id);

    expect(entries.at(-1)?.source).toBe('callback');
  });

  it('fails the transaction and short-circuits on an invalid fingerprint', async () => {
    await createPendingTransaction();
    const failed = vi.fn();
    events.on('payment:failed', failed);

    const payload = { ...signedCallback(), fingerprint: 'tampered' };
    const context = await pipeline.run(new CallbackContext(payload));

    expect(context.failureReason).toBe('invalid_callback_fingerprint');
    expect(context.requireTransaction().status).toBe('failed');
    expect(context.requireTransaction().merchant_response).toBe('invalid_callback_fingerprint');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('rolls back attempt updates when the propagated success transaction write fails', async () => {
    const transaction = await createPendingTransaction();

    await db.schema.dropTable(config.tables.transactionLogs);

    await expect(pipeline.run(new CallbackContext(signedCallback()))).rejects.toThrow();

    const [attempt] = await attempts.listByTransaction(transaction.id);
    const stored = await transactions.findById(transaction.id);

    expect(attempt?.gateway_transaction_id).toBeNull();
    expect(attempt?.status).toBe('pending');
    expect(stored?.transaction_id).toBeNull();
    expect(stored?.status).toBe('pending');
  });

  it('rolls back attempt updates when the propagated failure transaction write fails', async () => {
    const transaction = await createPendingTransaction();

    await db.schema.dropTable(config.tables.transactionLogs);

    const payload = { ...signedCallback(), fingerprint: 'tampered' };

    await expect(pipeline.run(new CallbackContext(payload))).rejects.toThrow();

    const [attempt] = await attempts.listByTransaction(transaction.id);
    const stored = await transactions.findById(transaction.id);

    expect(attempt?.gateway_transaction_id).toBeNull();
    expect(attempt?.status).toBe('pending');
    expect(stored?.transaction_id).toBeNull();
    expect(stored?.status).toBe('pending');
  });

  it('fails the transaction when callback details do not match', async () => {
    await createPendingTransaction('9999');
    const failed = vi.fn();
    events.on('payment:failed', failed);

    const context = await pipeline.run(new CallbackContext(signedCallback()));

    expect(context.failureReason).toBe('callback_details_mismatch');
    expect(context.requireTransaction().merchant_response).toBe('callback_details_mismatch');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('rejects callbacks signed for another posID', async () => {
    await createPendingTransaction();

    const context = await pipeline.run(new CallbackContext(signedCallback({ posID: '99999' })));

    expect(context.failureReason).toBe('callback_details_mismatch');
  });

  it.each([
    'posID',
    'currency',
    'transactionCode',
  ])('rejects callbacks missing %s', async (field) => {
    await createPendingTransaction();

    const context = await pipeline.run(new CallbackContext(signedCallback({}, [field])));

    expect(context.failureReason).toBe('callback_details_mismatch');
  });

  it('marks error message types as failed', async () => {
    await createPendingTransaction();
    const failed = vi.fn();
    events.on('payment:failed', failed);

    const context = await pipeline.run(new CallbackContext(signedCallback({ messageType: '6' })));

    expect(context.failureReason).toBeNull();
    expect(context.requireTransaction().status).toBe('failed');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown message types pending and emits payment:pending', async () => {
    await createPendingTransaction();
    const pending = vi.fn();
    events.on('payment:pending', pending);

    const context = await pipeline.run(new CallbackContext(signedCallback({ messageType: 'Z' })));

    expect(context.requireTransaction().status).toBe('pending');
    expect(pending).toHaveBeenCalledTimes(1);
  });

  it('throws when no transaction matches the callback', async () => {
    await expect(pipeline.run(new CallbackContext(signedCallback()))).rejects.toThrow(
      TransactionNotFoundError,
    );
  });
});
