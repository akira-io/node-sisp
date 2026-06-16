import { afterEach, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/create-sisp';
import { UnableToGenerateUniquePaymentIdentifiersError } from '../../src/exceptions';
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

function retryRequest(signedUrl: string): HttpRequestInfo {
  const url = new URL(signedUrl, 'http://localhost');

  return {
    ip: '10.0.0.1',
    method: 'POST',
    path: url.pathname,
    headers: { 'user-agent': 'vitest' },
    query: Object.fromEntries(url.searchParams),
    body: {},
  };
}

async function createFailedTransaction() {
  if (sisp === null) {
    throw new Error('SISP test instance has not been created.');
  }

  const transaction = await sisp.models.transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount: 1500,
  });

  const attempt = await sisp.models.transactionAttempts.createFromTransaction(transaction);

  await sisp.models.transactionAttempts.update(attempt.id, {
    status: 'failed',
    gateway_transaction_id: 'TID-1',
    message_type: '6',
    response_code: '01',
    merchant_response: '00',
    fingerprint: 'fp',
    callback_received_at: new Date().toISOString(),
  });

  return sisp.models.transactions.update(transaction.id, {
    status: 'failed',
    transaction_id: 'TID-1',
    message_type: '6',
    merchant_response: '00',
    response_code: '01',
    fingerprint: 'fp',
  });
}

async function retryFailedTransaction() {
  if (sisp === null) {
    throw new Error('SISP test instance has not been created.');
  }

  const transaction = await createFailedTransaction();
  const response = await sisp.handlers.handleRetryPayment(
    retryRequest(sisp.signedRetryUrl(transaction.id)),
  );

  expect(response.type).toBe('html');

  const updated = await sisp.models.transactions.findById(transaction.id);

  if (updated === null) {
    throw new Error('Retried transaction was not found.');
  }

  return updated;
}

describe('transaction attempts', () => {
  it('fails explicitly without persisting a duplicate when custom generators collide', async () => {
    sisp = await createSisp({
      ...baseConfig(),
      generators: {
        merchantReference: () => 'R-fixed',
        merchantSession: () => 'S-fixed',
        timeStamp: () => '2026-06-12 10:00:00',
      },
      identifierGeneration: { maxAttempts: 2, collisionRetrySleepMs: 0 },
    });

    const first = await sisp.handlers.handlePayment(paymentRequest());

    expect(first.type).toBe('html');

    await expect(sisp.handlers.handlePayment(paymentRequest())).rejects.toThrow(
      UnableToGenerateUniquePaymentIdentifiersError,
    );

    const transactions = await sisp.db(sisp.config.tables.transactions);
    const attempts = await sisp.db(sisp.config.tables.transactionAttempts);

    expect(transactions).toHaveLength(1);
    expect(attempts).toHaveLength(1);
  });

  it('keeps the merchant reference and rotates only the merchant session on retry', async () => {
    sisp = await createSisp(baseConfig());

    const retried = await retryFailedTransaction();
    const attempts = await sisp.models.transactionAttempts.listByTransaction(retried.id);

    expect(retried.status).toBe('pending');
    expect(retried.merchant_ref).toBe('R20260612100000');
    expect(retried.merchant_session).not.toBe('S20260612100000');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.merchant_ref).toBe('R20260612100000');
    expect(attempts[0]?.merchant_session).toBe('S20260612100000');
    expect(attempts[0]?.superseded_at).not.toBeNull();
    expect(attempts[1]?.merchant_ref).toBe('R20260612100000');
    expect(attempts[1]?.merchant_session).toBe(retried.merchant_session);
    expect(attempts[1]?.superseded_at).toBeNull();
  });

  it('does not let a late failed callback from an old attempt overwrite the active retry', async () => {
    sisp = await createSisp(baseConfig());

    const retried = await retryFailedTransaction();
    const [oldAttempt] = await sisp.models.transactionAttempts.listByTransaction(retried.id);

    if (oldAttempt === undefined) {
      throw new Error('Old attempt was not found.');
    }

    await sisp.handlePaymentCallback(
      sisp.generateSandboxPayload(
        {
          amount: 1500,
          merchantRef: oldAttempt.merchant_ref,
          merchantSession: oldAttempt.merchant_session,
        },
        'failed',
      ),
    );

    const updated = await sisp.models.transactions.findById(retried.id);
    const attempts = await sisp.models.transactionAttempts.listByTransaction(retried.id);

    expect(updated?.status).toBe('pending');
    expect(updated?.merchant_session).toBe(retried.merchant_session);
    expect(attempts[0]?.status).toBe('failed');
    expect(attempts[1]?.status).toBe('pending');
  });

  it('promotes a late successful callback from an old attempt', async () => {
    sisp = await createSisp(baseConfig());

    const retried = await retryFailedTransaction();
    const [oldAttempt] = await sisp.models.transactionAttempts.listByTransaction(retried.id);

    if (oldAttempt === undefined) {
      throw new Error('Old attempt was not found.');
    }

    await sisp.handlePaymentCallback(
      sisp.generateSandboxPayload({
        amount: 1500,
        merchantRef: oldAttempt.merchant_ref,
        merchantSession: oldAttempt.merchant_session,
      }),
    );

    const updated = await sisp.models.transactions.findById(retried.id);
    const attempts = await sisp.models.transactionAttempts.listByTransaction(retried.id);

    expect(updated?.status).toBe('completed');
    expect(updated?.merchant_session).toBe(oldAttempt.merchant_session);
    expect(attempts[0]?.status).toBe('completed');
    expect(attempts[1]?.status).toBe('pending');
  });
});
