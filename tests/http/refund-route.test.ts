import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { sispRoutes } from '../../src/presentation/express';

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
    merchant_response: 'Paid',
    response_code: '42',
  });
}

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

    const invalidResponse = await request(app)
      .post(`/sisp/refund/${transaction.id}`)
      .type('form')
      .send({ amount: '0' })
      .expect(400);

    expect(invalidResponse.body.message).toBe('Refund amount must be greater than 0.');

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

  it('rejects refund amounts that are not plain decimals', async () => {
    const transaction = await createCompletedTransaction();
    const app = express();
    app.use('/sisp', sispRoutes(sisp, { authorizeRefund: () => true }));

    for (const amount of ['0x10', '1e2', '10.005', 'abc']) {
      const response = await request(app)
        .post(`/sisp/refund/${transaction.id}`)
        .type('form')
        .send({ amount })
        .expect(400);

      expect(response.body.message).toBe('Refund amount must be greater than 0.');
    }
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

  it('spends the per-IP refund bucket before the authorizer runs', async () => {
    const limited = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      appKey: 'app-key',
      rateLimiting: { perIp: { limit: 2, windowSeconds: 3600 } },
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });
    const authorize = vi.fn(() => false);
    const app = express();
    app.use('/sisp', sispRoutes(limited, { authorizeRefund: authorize }));

    await request(app).post('/sisp/refund/999').type('form').send({ amount: '10' }).expect(403);
    await request(app).post('/sisp/refund/999').type('form').send({ amount: '10' }).expect(403);

    const response = await request(app)
      .post('/sisp/refund/999')
      .type('form')
      .send({ amount: '10' })
      .expect(429);

    expect(response.body.message).toBe('Too many refund requests. Try again later.');
    expect(authorize).toHaveBeenCalledTimes(2);
    await limited.destroy();
  });

  it('denies a handler call that omits the authorize hook', async () => {
    const result = await sisp.handlers.handleRefund(
      {
        ip: '',
        method: 'POST',
        path: '/sisp/refund/999',
        headers: {},
        query: {},
        body: { amount: '10' },
      },
      999,
    );

    expect(result.type === 'json' ? result.status : 0).toBe(403);
  });

  it('applies the authorize hook after the rate limit inside the handler', async () => {
    const result = await sisp.handlers.handleRefund(
      {
        ip: '',
        method: 'POST',
        path: '/sisp/refund/999',
        headers: {},
        query: {},
        body: { amount: '10' },
      },
      999,
      () => false,
    );

    expect(result.type === 'json' ? result.status : 0).toBe(403);
  });
});
