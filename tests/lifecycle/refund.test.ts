import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/create-sisp';
import { SispError, TransactionStateError } from '../../src/exceptions';
import { sispRoutes } from '../../src/express';
import { generateRefundFingerprint } from '../../src/fingerprints/refund-fingerprint';
import { computeToken } from '../../src/fingerprints/token';
import type { Sisp } from '../../src/sisp';

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

afterEach(async () => {
  await sisp.destroy();
});

async function createCompletedTransaction(amount = 1500) {
  const transaction = await sisp.models.transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount,
  });

  return sisp.models.transactions.update(transaction.id, {
    status: 'completed',
    transaction_id: '123',
    message_type: '8',
    response_code: '42',
  });
}

function payloadRefunds(payload: unknown): Array<Record<string, unknown>> {
  return (payload as { refunds: Array<Record<string, unknown>> }).refunds;
}

describe('refund transaction', () => {
  it('fully refunds a completed transaction with a signed total reversal request', async () => {
    const transaction = await createCompletedTransaction();
    const refunded = vi.fn();
    sisp.on('transaction:refunded', refunded);

    const result = await sisp.refund(transaction).full().reason('customer_request').process();

    expect(result.status).toBe('refunded');
    expect(result.merchant_response).toBe('customer_request::1500');
    expect(result.refunded_at).not.toBeNull();
    expect(refunded).toHaveBeenCalledWith({
      transaction: result,
      amount: 1500,
      reason: 'customer_request',
    });

    const refunds = payloadRefunds(result.payload);

    expect(refunds).toHaveLength(1);

    const storedRequest = refunds[0]?.request as Record<string, string | number>;

    expect(storedRequest.transactionCode).toBe('4');
    expect(storedRequest.reversal).toBe('R');
    expect(storedRequest.fingerprintversion).toBe('2');
    expect(storedRequest.clearingPeriod).toBe('42');
    expect(storedRequest.transactionID).toBe('123');
    expect(storedRequest.fingerprint).toBe(
      generateRefundFingerprint(computeToken('TEST_POS_AUT_CODE'), {
        amount: storedRequest.amount as number,
        timeStamp: storedRequest.timeStamp as string,
        merchantRef: storedRequest.merchantRef as string,
        merchantSession: storedRequest.merchantSession as string,
        posID: storedRequest.posID as string,
        currency: storedRequest.currency as string,
        transactionCode: storedRequest.transactionCode as string,
        clearingPeriod: storedRequest.clearingPeriod as string,
        transactionID: storedRequest.transactionID as string,
      }),
    );

    const logs = await sisp.models.transactionLogs.listByTransaction(transaction.id);

    expect(logs.at(-1)?.source).toBe('refund');
  });

  it('keeps partial refunds completed until the balance reaches zero', async () => {
    const transaction = await createCompletedTransaction();

    const partial = await sisp.refund(transaction).amount(500).process();

    expect(partial.status).toBe('completed');
    expect(payloadRefunds(partial.payload)[0]?.request).toMatchObject({ transactionCode: '8' });

    const final = await sisp.refund(partial).amount(1000).process();

    expect(final.status).toBe('refunded');
    expect(payloadRefunds(final.payload)).toHaveLength(2);
  });

  it('rejects refunds above the refundable balance', async () => {
    const transaction = await createCompletedTransaction();
    const partial = await sisp.refund(transaction).amount(1000).process();

    await expect(sisp.refund(partial).amount(600).process()).rejects.toThrow(
      'Refund amount (600) exceeds refundable balance.',
    );
  });

  it('serializes concurrent partial refunds against the persisted balance', async () => {
    const transaction = await createCompletedTransaction(1000);
    const results = await Promise.allSettled([
      sisp.refund(transaction).amount(700).reason('first').process(),
      sisp.refund(transaction).amount(700).reason('second').process(),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    const persisted = await sisp.models.transactions.findById(transaction.id);

    if (persisted === null) {
      throw new Error('Expected persisted transaction to exist.');
    }

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(payloadRefunds(persisted.payload)).toHaveLength(1);
    expect(persisted.status).toBe('completed');
  });

  it('rejects refunds on transactions that are not completed', async () => {
    const transaction = await sisp.models.transactions.create({
      merchantRef: 'R2',
      merchantSession: 'S2',
      amount: 100,
    });

    await expect(sisp.refund(transaction).full().process()).rejects.toThrow(TransactionStateError);
  });

  it('rejects non-positive amounts and requires an amount', async () => {
    const transaction = await createCompletedTransaction();

    await expect(sisp.refund(transaction).amount(0).process()).rejects.toThrow(
      'Refund amount must be greater than 0.',
    );
    await expect(sisp.refund(transaction).process()).rejects.toThrow(
      'A refund amount is required. Call amount() or full() first.',
    );
  });

  it('requires the original clearingPeriod and transactionID from the callback', async () => {
    const transaction = await sisp.models.transactions.create({
      merchantRef: 'R3',
      merchantSession: 'S3',
      amount: 100,
    });
    const completed = await sisp.models.transactions.update(transaction.id, {
      status: 'completed',
    });

    await expect(sisp.refund(completed).full().process()).rejects.toThrow(SispError);
    await expect(sisp.refund(completed).full().process()).rejects.toThrow(
      'SISP refund requires original clearingPeriod.',
    );
  });
});

describe('refund route', () => {
  it('denies refunds without an authorization hook', async () => {
    const transaction = await createCompletedTransaction();
    const app = express();
    app.use('/sisp', sispRoutes(sisp));

    const response = await request(app)
      .post(`/sisp/refund/${transaction.id}`)
      .type('form')
      .send({ amount: '1500' })
      .expect(403);

    expect(response.body.message).toBe('Unauthorized to refund this transaction.');
  });

  it('processes authorized refunds and reports state errors as 400', async () => {
    const transaction = await createCompletedTransaction();
    const app = express();
    app.use('/sisp', sispRoutes(sisp, { authorizeRefund: () => true }));

    const response = await request(app)
      .post(`/sisp/refund/${transaction.id}`)
      .type('form')
      .send({ amount: '1500', reason: 'support_ticket' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.transaction.status).toBe('refunded');

    await request(app)
      .post(`/sisp/refund/${transaction.id}`)
      .type('form')
      .send({ amount: '10' })
      .expect(400);

    await request(app).post('/sisp/refund/999').type('form').send({ amount: '10' }).expect(404);
  });

  it('rate limits refund requests per IP', async () => {
    const limited = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      appKey: 'app-key',
      rateLimiting: { perIp: { limit: 2, windowSeconds: 3600 } },
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });
    const app = express();
    app.use('/sisp', sispRoutes(limited, { authorizeRefund: () => true }));

    await request(app).post('/sisp/refund/999').type('form').send({ amount: '10' }).expect(404);
    await request(app).post('/sisp/refund/999').type('form').send({ amount: '10' }).expect(404);

    const response = await request(app)
      .post('/sisp/refund/999')
      .type('form')
      .send({ amount: '10' })
      .expect(429);

    expect(response.body.message).toBe('Too many refund requests. Try again later.');
    await limited.destroy();
  });
});
