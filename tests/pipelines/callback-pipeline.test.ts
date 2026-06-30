import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailTransactionAction } from '../../src/application/actions/fail-transaction';
import {
  credentialsFromConfig,
  type ResolvedSispConfig,
  resolveConfig,
} from '../../src/application/config';
import { SispEventEmitter } from '../../src/application/events';
import { CallbackContext } from '../../src/application/pipelines/callback/callback-context';
import { HandleCallbackPipeline } from '../../src/application/pipelines/callback/handle-callback-pipeline';
import { ApplyTransactionStatus } from '../../src/application/pipelines/callback/pipes/apply-transaction-status';
import { DispatchPaymentEvents } from '../../src/application/pipelines/callback/pipes/dispatch-payment-events';
import { EnsureCallbackMatchesTransaction } from '../../src/application/pipelines/callback/pipes/ensure-callback-matches-transaction';
import { ResolveTransaction } from '../../src/application/pipelines/callback/pipes/resolve-transaction';
import { ValidateFingerprint } from '../../src/application/pipelines/callback/pipes/validate-fingerprint';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { TransactionNotFoundError } from '../../src/domain/errors/exceptions';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import { runMigrations } from '../../src/infrastructure/storage/knex/auto-migrate';
import { createKnexInstance } from '../../src/infrastructure/storage/knex/create-knex';
import { PayloadCipher } from '../../src/infrastructure/storage/knex/encryption';
import { Transaction } from '../../src/infrastructure/storage/knex/models/transaction';
import { TransactionAttempt } from '../../src/infrastructure/storage/knex/models/transaction-attempt';
import { TransactionLog } from '../../src/infrastructure/storage/knex/models/transaction-log';

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

  it('ignores a replayed programmatic callback without dispatching another event', async () => {
    await createPendingTransaction();
    const completed = vi.fn();
    events.on('payment:completed', completed);

    const payload = signedCallback();
    const first = await pipeline.run(new CallbackContext(payload));
    const replay = await pipeline.run(new CallbackContext(payload));
    const entries = await logs.listByTransaction(first.requireTransaction().id);

    expect(first.transactionStatusPropagated).toBe(true);
    expect(replay.transactionStatusPropagated).toBe(false);
    expect(replay.requireTransaction().status).toBe('completed');
    expect(completed).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
  });

  it('deduplicates concurrent callback replays inside the pipeline', async () => {
    await createPendingTransaction();
    const completed = vi.fn();
    events.on('payment:completed', completed);

    const payload = signedCallback();
    const [first, second] = await Promise.all([
      pipeline.run(new CallbackContext(payload)),
      pipeline.run(new CallbackContext(payload)),
    ]);
    const entries = await logs.listByTransaction(first.requireTransaction().id);
    const propagated = [first, second].filter((context) => context.transactionStatusPropagated);

    expect(propagated).toHaveLength(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
  });

  it('fails the transaction and emits payment:failed on an invalid fingerprint', async () => {
    const pending = await createPendingTransaction();
    const failed = vi.fn();
    events.on('payment:failed', failed);

    const payload = { ...signedCallback(), fingerprint: 'tampered' };
    const context = await pipeline.run(new CallbackContext(payload));
    const [attempt] = await attempts.listByTransaction(pending.id);
    const stored = await transactions.findById(pending.id);

    expect(context.failureReason).toBe('invalid_callback_fingerprint');
    expect(context.transactionStatusPropagated).toBe(true);
    expect(stored?.status).toBe('failed');
    expect(stored?.merchant_response).toBe('invalid_callback_fingerprint');
    expect(attempt?.status).toBe('failed');
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

  it('rolls back attempt updates when a propagated failure transaction write fails', async () => {
    const transaction = await createPendingTransaction();

    await db.schema.dropTable(config.tables.transactionLogs);

    const payload = signedCallback({ merchantRespCP: '99' });

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
