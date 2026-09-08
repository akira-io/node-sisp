import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
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

afterEach(() => sisp.destroy());

function statusRequest(): HttpRequestInfo {
  return {
    ip: '127.0.0.1',
    method: 'GET',
    path: '/sisp/transactions/x',
    headers: {},
    query: {},
    body: {},
  };
}

it('returns the hydrated transaction status as JSON', async () => {
  const created = await sisp.models.transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount: 1500,
  });

  const result = await sisp.handlers.handleTransactionStatus(statusRequest(), created.merchant_ref);

  expect(result.type).toBe('json');

  if (result.type === 'json') {
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      ref: 'R20260612100000',
      status: 'pending',
      amount: 1500,
    });
  }
});

it('returns 404 for an unknown reference', async () => {
  const result = await sisp.handlers.handleTransactionStatus(statusRequest(), 'does-not-exist');

  expect(result.type).toBe('json');

  if (result.type === 'json') {
    expect(result.status).toBe(404);
  }
});

it('exposes a structured error instead of the raw merchant response', async () => {
  const created = await sisp.models.transactions.create({
    merchantRef: 'R20260612100001',
    merchantSession: 'S20260612100001',
    amount: 1500,
  });

  await sisp.models.transactions.update(created.id, {
    status: 'failed',
    message_type: '6',
    merchant_response: 'internal reason',
  });

  const result = await sisp.handlers.handleTransactionStatus(statusRequest(), created.merchant_ref);
  const data = result.type === 'json' ? (result.data as Record<string, unknown>) : {};

  expect(data.detail).not.toBe('internal reason');
  expect((data.error as { code: string }).code).toBe('6');
});

it('rate limits status lookups per IP', async () => {
  const limited = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    rateLimiting: { perIp: { limit: 2, windowSeconds: 3600 } },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  try {
    await limited.handlers.handleTransactionStatus(statusRequest(), 'x');
    await limited.handlers.handleTransactionStatus(statusRequest(), 'x');

    const result = await limited.handlers.handleTransactionStatus(statusRequest(), 'x');

    expect(result.type === 'json' ? result.status : 0).toBe(429);
  } finally {
    await limited.destroy();
  }
});

it('lets the adapter deny status lookups through authorizeTransactionStatus', async () => {
  const app = express();

  app.use('/sisp', sispRoutes(sisp, { authorizeTransactionStatus: () => false }));

  await request(app).get('/sisp/transactions/R1').expect(403);
});
