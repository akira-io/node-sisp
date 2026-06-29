import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildRequestPayloadAction } from '../../src/application/actions/build-request-payload';
import { StoreRequestMetadataAction } from '../../src/application/actions/store-request-metadata';
import {
  credentialsFromConfig,
  type ResolvedSispConfig,
  resolveConfig,
} from '../../src/application/config';
import { PaymentContext } from '../../src/application/pipelines/payment/payment-context';
import { BuildPaymentRequest } from '../../src/application/pipelines/payment/pipes/build-payment-request';
import { CaptureRequestMetadata } from '../../src/application/pipelines/payment/pipes/capture-request-metadata';
import { EnforceRateLimits } from '../../src/application/pipelines/payment/pipes/enforce-rate-limits';
import { EnsureIpIsNotBlacklisted } from '../../src/application/pipelines/payment/pipes/ensure-ip-is-not-blacklisted';
import { PersistTransaction } from '../../src/application/pipelines/payment/pipes/persist-transaction';
import { ProcessPaymentPipeline } from '../../src/application/pipelines/payment/process-payment-pipeline';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import {
  BlacklistedIdentifierError,
  RateLimitExceededError,
} from '../../src/domain/errors/exceptions';
import { runMigrations } from '../../src/infrastructure/database/auto-migrate';
import { createKnexInstance } from '../../src/infrastructure/database/create-knex';
import { PayloadCipher } from '../../src/infrastructure/database/encryption';
import { Blacklist } from '../../src/infrastructure/database/models/blacklist';
import { Invoice } from '../../src/infrastructure/database/models/invoice';
import { RateLimit } from '../../src/infrastructure/database/models/rate-limit';
import { RequestMetadata } from '../../src/infrastructure/database/models/request-metadata';
import { Transaction } from '../../src/infrastructure/database/models/transaction';
import { TransactionAttempt } from '../../src/infrastructure/database/models/transaction-attempt';
import { TransactionItem } from '../../src/infrastructure/database/models/transaction-item';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';

let db: Knex;
let config: ResolvedSispConfig;
let pipeline: ProcessPaymentPipeline;
let transactions: Transaction;
let attempts: TransactionAttempt;
let items: TransactionItem;
let invoices: Invoice;
let metadata: RequestMetadata;
let blacklist: Blacklist;

beforeEach(async () => {
  db = createKnexInstance({ client: 'better-sqlite3', connection: { filename: ':memory:' } });
  config = resolveConfig({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    url: 'https://gateway.vinti4.test/payment',
    baseUrl: 'http://localhost:3000',
    appKey: 'app-key',
    rateLimiting: { perIp: { limit: 3, windowSeconds: 3600 } },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
  await runMigrations(db, config.tables);

  const cipher = new PayloadCipher(config.appKey);

  transactions = new Transaction(db, config.tables, cipher);
  attempts = new TransactionAttempt(db, config.tables, cipher);
  items = new TransactionItem(db, config.tables);
  invoices = new Invoice(db, config.tables);
  metadata = new RequestMetadata(db, config.tables);
  blacklist = new Blacklist(db, config.tables);

  const buildRequestPayload = new BuildRequestPayloadAction(
    config,
    new StaticCredentialsResolver(credentialsFromConfig(config)),
  );

  pipeline = new ProcessPaymentPipeline([
    new EnsureIpIsNotBlacklisted(blacklist),
    new EnforceRateLimits(new RateLimit(db, config.tables), config.rateLimiting),
    new BuildPaymentRequest(buildRequestPayload),
    new PersistTransaction(
      config,
      db,
      transactions,
      attempts,
      items,
      invoices,
      buildRequestPayload,
    ),
    new CaptureRequestMetadata(new StoreRequestMetadataAction(metadata)),
  ]);
});

afterEach(async () => {
  await db.destroy();
});

function paymentRequest(): HttpRequestInfo {
  return {
    ip: '10.0.0.1',
    method: 'POST',
    path: '/sisp/payment',
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari',
      'accept-language': 'pt-CV',
      authorization: 'Bearer secret-token',
    },
    query: {},
    body: {
      amount: 1500,
      customer_name: 'Kid',
      customer_email: 'kid@akira.cv',
      items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1500 }],
    },
  };
}

function contextFor(amount = 1500): PaymentContext {
  return new PaymentContext({ amount }, paymentRequest());
}

describe('ProcessPaymentPipeline', () => {
  it('builds, persists, and audits a pending payment end to end', async () => {
    const context = await pipeline.run(contextFor());

    const request = context.requirePaymentRequest();
    const transaction = context.requireTransaction();

    expect(request.fingerprint).not.toBe('');
    expect(transaction.status).toBe('pending');
    expect(transaction.amount_cents).toBe(150000);
    expect(transaction.customer_email).toBe('kid@akira.cv');
    expect(transaction.payload).toMatchObject({ posID: '90051', amount: 1500 });

    const storedItems = await items.listByTransaction(transaction.id);

    expect(storedItems).toHaveLength(1);
    expect(storedItems[0]?.unit_price_cents).toBe(75000);
    expect(storedItems[0]?.total_price_cents).toBe(150000);

    const storedAttempts = await attempts.listByTransaction(transaction.id);

    expect(storedAttempts).toHaveLength(1);
    expect(storedAttempts[0]?.merchant_ref).toBe(transaction.merchant_ref);
    expect(storedAttempts[0]?.merchant_session).toBe(transaction.merchant_session);

    const invoice = await invoices.findByTransaction(transaction.id);

    expect(invoice?.status).toBe('pending');
    expect(invoice?.invoice_number).toMatch(/^INV-\d{6}-\d{6}$/);

    const requestMetadata = await metadata.listByTransaction(transaction.id);

    expect(requestMetadata).toHaveLength(1);
    expect(requestMetadata[0]?.is_mobile).toBe(true);
    expect(requestMetadata[0]?.device_type).toBe('mobile');
  });

  it('redacts sensitive headers in the captured metadata', async () => {
    const context = await pipeline.run(contextFor());

    const [stored] = await metadata.listByTransaction(context.requireTransaction().id);
    const customMetadata = stored?.custom_metadata as {
      headers: Record<string, unknown>;
      payload: Record<string, unknown>;
    };

    expect(customMetadata.headers.authorization).toBe('[redacted]');
    expect(customMetadata.payload.customer_email).toBe('kid@akira.cv');
  });

  it('rejects blacklisted IPs before any work happens', async () => {
    await blacklist.add({ type: 'ip', value: '10.0.0.1', reason: 'fraud' });

    await expect(pipeline.run(contextFor())).rejects.toThrow(BlacklistedIdentifierError);
    expect(await db(config.tables.transactions).first()).toBeUndefined();
  });

  it('enforces the per-IP rate limit', async () => {
    await pipeline.run(contextFor());
    await pipeline.run(contextFor());
    await pipeline.run(contextFor());

    await expect(pipeline.run(contextFor())).rejects.toThrow(RateLimitExceededError);
  });
});
