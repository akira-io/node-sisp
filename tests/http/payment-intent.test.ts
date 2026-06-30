import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';

let sisp: Sisp;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
});

afterEach(() => sisp.destroy());

function paymentBody() {
  return {
    checkout_intent_id: 'ck_intent_1',
    amount: '1500',
    customer_email: 'cliente@example.cv',
    items: [{ product_name: 'Pro', quantity: '1', unit_price: '1500', total_price: '1500' }],
  };
}

it('returns the gateway action and fields as JSON and persists the transaction', async () => {
  const result = await sisp.handlers.handlePaymentIntent({
    ip: '127.0.0.1',
    method: 'POST',
    path: '/sisp/payment/intent',
    headers: {},
    query: {},
    body: paymentBody(),
  });

  expect(result.type).toBe('json');

  if (result.type === 'json') {
    const data = result.data as { action: string; fields: Record<string, unknown>; ref: string };

    expect(data.action).toContain('FingerPrint=');
    expect(data.fields.fingerprint).toBeTruthy();
    expect(data.fields.merchantRef).toBe(data.ref);

    const transaction = await sisp.models.transactions.findByRef(data.ref);

    expect(transaction).toBeTruthy();
    expect(transaction?.status).toBe('pending');
    expect(transaction?.amount).toBe(1500);

    const attempts = transaction
      ? await sisp.models.transactionAttempts.listByTransaction(transaction.id)
      : [];

    expect(attempts[0]).toBeTruthy();
  }
});

it('returns 422 for invalid input', async () => {
  const result = await sisp.handlers.handlePaymentIntent({
    ip: '127.0.0.1',
    method: 'POST',
    path: '/sisp/payment/intent',
    headers: {},
    query: {},
    body: { amount: '0' },
  });

  expect(result.type).toBe('json');

  if (result.type === 'json') {
    expect(result.status).toBe(422);
  }
});
