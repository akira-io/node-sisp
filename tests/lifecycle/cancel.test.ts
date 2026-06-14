import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/create-sisp';
import { TransactionStateError } from '../../src/exceptions';
import { sispRoutes } from '../../src/express';
import type { Sisp } from '../../src/sisp';

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

async function createTransaction(status: 'pending' | 'completed' = 'pending') {
  const transaction = await sisp.models.transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount: 1500,
  });

  if (status === 'pending') {
    return transaction;
  }

  return sisp.models.transactions.update(transaction.id, { status });
}

describe('cancel transaction', () => {
  it('cancels a pending transaction and emits transaction:cancelled', async () => {
    const transaction = await createTransaction();
    const cancelled = vi.fn();
    sisp.on('transaction:cancelled', cancelled);

    const result = await sisp.cancel(transaction, 'changed_mind');

    expect(result.status).toBe('cancelled');
    expect(result.message_type).toBe('cancelled');
    expect(result.merchant_response).toBe('changed_mind');
    expect(result.cancelled_at).not.toBeNull();
    expect(cancelled).toHaveBeenCalledWith({ transaction: result, reason: 'changed_mind' });

    const logs = await sisp.models.transactionLogs.listByTransaction(transaction.id);

    expect(logs.at(-1)?.source).toBe('cancel');
  });

  it('refuses to cancel completed transactions', async () => {
    const transaction = await createTransaction('completed');

    await expect(sisp.cancel(transaction)).rejects.toThrow(TransactionStateError);
    await expect(sisp.cancel(transaction)).rejects.toThrow(
      "Transaction with status 'completed' cannot be cancelled.",
    );
  });

  it('cancels through the signed route and redirects to the result page', async () => {
    const transaction = await createTransaction();
    const url = sisp.signedCancelUrl(transaction.merchant_ref);

    const response = await request(app).get(url).expect(302);

    expect(response.headers.location).toBe(
      `/sisp/callback?ref=${encodeURIComponent(transaction.merchant_ref)}`,
    );

    const updated = await sisp.models.transactions.findById(transaction.id);

    expect(updated?.status).toBe('cancelled');
  });

  it('rejects tampered signatures', async () => {
    const transaction = await createTransaction();
    const url = sisp.signedCancelUrl(transaction.merchant_ref).replace('R2026', 'R2027');

    await request(app).get(url).expect(403);
  });

  it('returns 404 for unknown transactions', async () => {
    const url = sisp.signedCancelUrl('R-missing');

    await request(app).get(url).expect(404);
  });

  it('returns 400 when the transaction cannot be cancelled', async () => {
    const transaction = await createTransaction('completed');
    const url = sisp.signedCancelUrl(transaction.merchant_ref);

    const response = await request(app).get(url).expect(400);

    expect(response.body.message).toContain('cannot be cancelled');
  });
});
