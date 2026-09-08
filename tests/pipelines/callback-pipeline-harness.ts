import type { Knex } from 'knex';
import { afterEach, beforeEach } from 'vitest';
import { FailTransactionAction } from '../../src/application/actions/fail-transaction';
import {
  credentialsFromConfig,
  type ResolvedSispConfig,
  resolveConfig,
} from '../../src/application/config';
import { SispEventEmitter } from '../../src/application/events';
import { HandleCallbackPipeline } from '../../src/application/pipelines/callback/handle-callback-pipeline';
import { ApplyTransactionStatus } from '../../src/application/pipelines/callback/pipes/apply-transaction-status';
import { DispatchPaymentEvents } from '../../src/application/pipelines/callback/pipes/dispatch-payment-events';
import { EnsureCallbackMatchesTransaction } from '../../src/application/pipelines/callback/pipes/ensure-callback-matches-transaction';
import { ResolveTransaction } from '../../src/application/pipelines/callback/pipes/resolve-transaction';
import { ValidateFingerprint } from '../../src/application/pipelines/callback/pipes/validate-fingerprint';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import { runMigrations } from '../../src/infrastructure/storage/knex/auto-migrate';
import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';
import type { Transaction } from '../../src/infrastructure/storage/knex/models/transaction';
import type { TransactionAttempt } from '../../src/infrastructure/storage/knex/models/transaction-attempt';
import { TransactionLog } from '../../src/infrastructure/storage/knex/models/transaction-log';

export const token = computeToken('TEST_POS_AUT_CODE');

export interface CallbackPipelineHarness {
  db: Knex;
  config: ResolvedSispConfig;
  storage: KnexStorage;
  transactions: Transaction;
  attempts: TransactionAttempt;
  logs: TransactionLog;
  events: SispEventEmitter;
  pipeline: HandleCallbackPipeline;
}

export function useCallbackPipeline(): CallbackPipelineHarness {
  const h = {} as CallbackPipelineHarness;

  beforeEach(async () => {
    h.config = resolveConfig({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      appKey: 'app-key-with-thirty-two-characters!',
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });
    const database = h.config.database;

    if (!database) throw new Error('database config missing');

    h.storage = await KnexStorage.create(database, h.config.tables, h.config.appKey);
    h.db = h.storage.raw;
    await runMigrations(h.db, h.config.tables);

    h.transactions = h.storage.transactions;
    h.attempts = h.storage.transactionAttempts;
    h.logs = new TransactionLog(h.db, h.config.tables);
    h.events = new SispEventEmitter();

    const credentialsResolver = new StaticCredentialsResolver(credentialsFromConfig(h.config));
    const failTransaction = new FailTransactionAction(h.storage);

    h.pipeline = new HandleCallbackPipeline([
      new ResolveTransaction(h.storage),
      new ValidateFingerprint(credentialsResolver),
      new EnsureCallbackMatchesTransaction(
        h.config,
        credentialsResolver,
        failTransaction,
        h.events,
      ),
      new ApplyTransactionStatus(h.storage),
      new DispatchPaymentEvents(h.events),
    ]);
  });

  afterEach(async () => {
    await h.storage.destroy();
  });

  return h;
}

export async function createPendingTransaction(
  h: CallbackPipelineHarness,
  amount: number | string = '1500',
) {
  const transaction = await h.transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount,
    currency: '132',
    transactionCode: '1',
  });

  await h.attempts.createFromTransaction(transaction);

  return transaction;
}

export function signedCallback(
  overrides: Record<string, unknown> = {},
  omittedFields: string[] = [],
) {
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
