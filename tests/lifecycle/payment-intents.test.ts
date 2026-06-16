import { afterEach, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/create-sisp';
import type { HttpRequestInfo } from '../../src/http/request-info';
import type { Sisp } from '../../src/sisp';

let sisp: Sisp | null = null;

afterEach(async () => {
  await sisp?.destroy();
  sisp = null;
});

function baseConfig() {
  return {
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    database: { client: 'better-sqlite3' as const, connection: { filename: ':memory:' } },
    rateLimiting: { enabled: false },
  };
}

function paymentRequest(body: Record<string, unknown> = {}): HttpRequestInfo {
  return {
    ip: '10.0.0.1',
    method: 'POST',
    path: '/sisp/payment',
    headers: { 'user-agent': 'vitest' },
    query: {},
    body: {
      amount: 1500,
      items: [{ product_name: 'Bilhete', quantity: 1, unit_price: 1500, total_price: 1500 }],
      ...body,
    },
  };
}

describe('payment intents', () => {
  it('reuses an existing pending transaction when the checkout intent is posted twice', async () => {
    sisp = await createSisp(baseConfig());

    const first = await sisp.handlers.handlePayment(
      paymentRequest({ checkout_intent_id: 'checkout-intent-duplicate' }),
    );

    expect(first.type).toBe('html');

    const [transaction] = await sisp.db(sisp.config.tables.transactions);

    const second = await sisp.handlers.handlePayment(
      paymentRequest({ checkout_intent_id: 'checkout-intent-duplicate' }),
    );

    const transactions = await sisp.db(sisp.config.tables.transactions);
    const attempts = await sisp.db(sisp.config.tables.transactionAttempts);
    const intents = await sisp.db(sisp.config.tables.paymentIntents);

    expect(second.type).toBe('html');
    expect(second.type === 'html' ? second.html : '').toContain(transaction.merchant_ref);
    expect(transactions).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(intents).toHaveLength(1);
    expect(Number(intents[0]?.transaction_id)).toBe(Number(transaction.id));
  });

  it('creates a retry attempt for the same transaction when a failed checkout intent is posted again', async () => {
    let session = 0;

    sisp = await createSisp({
      ...baseConfig(),
      generators: {
        merchantSession: () => `S-incrementing-${++session}`,
      },
    });

    const checkoutIntent = { idempotency_key: 'checkout-intent-retry' };
    const first = await sisp.handlers.handlePayment(paymentRequest(checkoutIntent));

    expect(first.type).toBe('html');

    const [created] = await sisp.db(sisp.config.tables.transactions);
    const oldSession = String(created.merchant_session);

    await sisp.models.transactions.update(Number(created.id), {
      status: 'failed',
      transaction_id: 'FAILED-GATEWAY-ID',
      message_type: '13',
      merchant_response: 'declined',
      response_code: '13',
      fingerprint: 'failed-fingerprint',
    });

    const second = await sisp.handlers.handlePayment(paymentRequest(checkoutIntent));
    const transaction = await sisp.models.transactions.findById(Number(created.id));
    const attempts = await sisp.models.transactionAttempts.listByTransaction(Number(created.id));
    const intents = await sisp.db(sisp.config.tables.paymentIntents);

    expect(second.type).toBe('html');
    expect(transaction?.status).toBe('pending');
    expect(transaction?.transaction_id).toBeNull();
    expect(transaction?.merchant_session).not.toBe(oldSession);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.merchant_session).toBe(oldSession);
    expect(attempts[0]?.superseded_at).not.toBeNull();
    expect(attempts[1]?.merchant_ref).toBe(transaction?.merchant_ref);
    expect(attempts[1]?.merchant_session).toBe(transaction?.merchant_session);
    expect(Number(intents[0]?.transaction_id)).toBe(Number(created.id));
  });

  it('rejects a duplicate checkout intent while the first request is still being reserved', async () => {
    sisp = await createSisp(baseConfig());

    await sisp.db(sisp.config.tables.paymentIntents).insert({
      idempotency_key: 'checkout-intent-processing',
      status: 'processing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const response = await sisp.handlers.handlePayment(
      paymentRequest({ checkout_intent_id: 'checkout-intent-processing' }),
    );

    expect(response).toEqual({
      type: 'json',
      status: 409,
      data: { message: 'Payment is already being processed.' },
    });
    expect(await sisp.db(sisp.config.tables.transactions)).toHaveLength(0);
    expect(await sisp.db(sisp.config.tables.transactionAttempts)).toHaveLength(0);
  });

  it('reclaims a failed checkout intent that never reached a transaction', async () => {
    sisp = await createSisp(baseConfig());

    await sisp.db(sisp.config.tables.paymentIntents).insert({
      idempotency_key: 'checkout-intent-failed',
      status: 'failed',
      failure_reason: 'temporary database timeout',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const response = await sisp.handlers.handlePayment(
      paymentRequest({ checkout_intent_id: 'checkout-intent-failed' }),
    );

    const transactions = await sisp.db(sisp.config.tables.transactions);
    const intents = await sisp.db(sisp.config.tables.paymentIntents);

    expect(response.type).toBe('html');
    expect(transactions).toHaveLength(1);
    expect(intents[0]?.status).toBe('submitted');
    expect(Number(intents[0]?.transaction_id)).toBe(Number(transactions[0]?.id));
    expect(intents[0]?.failure_reason).toBeNull();
  });

  it('reuses the created transaction when a downstream payment pipe fails after persistence', async () => {
    sisp = await createSisp({
      ...baseConfig(),
      pipelines: {
        payment: (defaults) => [
          ...defaults,
          {
            async handle(): Promise<void> {
              throw new Error('metadata transport failed');
            },
          },
        ],
      },
    });

    await expect(
      sisp.handlers.handlePayment(paymentRequest({ checkout_intent_id: 'checkout-intent-saved' })),
    ).rejects.toThrow('metadata transport failed');

    const retry = await sisp.handlers.handlePayment(
      paymentRequest({ checkout_intent_id: 'checkout-intent-saved' }),
    );
    const transactions = await sisp.db(sisp.config.tables.transactions);
    const attempts = await sisp.db(sisp.config.tables.transactionAttempts);
    const intents = await sisp.db(sisp.config.tables.paymentIntents);

    expect(retry.type).toBe('html');
    expect(transactions).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(intents[0]?.status).toBe('submitted');
    expect(Number(intents[0]?.transaction_id)).toBe(Number(transactions[0]?.id));
  });
});
