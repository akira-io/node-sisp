import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/create-sisp';
import { sispRoutes } from '../../src/express';
import type { Sisp } from '../../src/sisp';
import { UrlSigner } from '../../src/support/signed-url';

let sisp: Sisp;
let app: express.Express;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  app = express();
  app.use('/sisp', sispRoutes(sisp));
});

afterEach(async () => {
  await sisp.destroy();
});

async function createFailedTransaction() {
  const transaction = await sisp.models.transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount: 1500,
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

describe('retry payment', () => {
  it('resets the transaction to pending with a rotated session on POST', async () => {
    const transaction = await createFailedTransaction();

    const response = await request(app).post(sisp.signedRetryUrl(transaction.id)).expect(200);

    expect(response.text).toContain("name='merchantRef' value='R20260612100000'");

    const updated = await sisp.models.transactions.findById(transaction.id);

    expect(updated?.status).toBe('pending');
    expect(updated?.merchant_session).not.toBe('S20260612100000');
    expect(updated?.merchant_session).toMatch(/^S\d{14}[0-9a-f]{12}$/);
    expect(updated?.transaction_id).toBeNull();
    expect(updated?.message_type).toBeNull();
    expect(updated?.merchant_response).toBeNull();
    expect(updated?.response_code).toBeNull();
    expect(updated?.fingerprint).toBeNull();

    const logs = await sisp.models.transactionLogs.listByTransaction(transaction.id);

    expect(logs.at(-1)?.source).toBe('retry');
  });

  it('renders the form without touching the transaction on GET', async () => {
    const transaction = await createFailedTransaction();

    const response = await request(app).get(sisp.signedRetryUrl(transaction.id)).expect(200);

    expect(response.text).toContain("name='merchantSession' value='S20260612100000'");

    const untouched = await sisp.models.transactions.findById(transaction.id);

    expect(untouched?.status).toBe('failed');
    expect(untouched?.merchant_session).toBe('S20260612100000');
  });

  it('rejects unsigned and expired URLs', async () => {
    const transaction = await createFailedTransaction();

    await request(app).get(`/sisp/retry-payment?transaction=${transaction.id}`).expect(403);

    const expired = new UrlSigner('app-key').sign(
      '/sisp/retry-payment',
      { transaction: transaction.id },
      new Date(Date.now() - 1000),
    );

    await request(app).get(expired).expect(403);
  });

  it('refuses to retry transactions that are not failed', async () => {
    const transaction = await sisp.models.transactions.create({
      merchantRef: 'R2',
      merchantSession: 'S2',
      amount: 100,
    });

    const response = await request(app).post(sisp.signedRetryUrl(transaction.id)).expect(400);

    expect(response.body.message).toContain('cannot be retried');
  });

  it('returns 404 for unknown transactions', async () => {
    await request(app).get(sisp.signedRetryUrl(999)).expect(404);
  });

  it('exposes the retry URL in the callback result for failed payments', async () => {
    const transaction = await createFailedTransaction();

    const response = await request(app)
      .get(`/sisp/callback?ref=${transaction.merchant_ref}`)
      .expect(200);

    expect(response.body.allowRetry).toBe(true);
    expect(response.body.retryUrl).toContain('/sisp/retry-payment?');
    expect(response.body.retryUrl).toContain('signature=');
  });
});
