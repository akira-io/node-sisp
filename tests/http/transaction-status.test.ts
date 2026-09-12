import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { TransactionStatus } from '../../src/domain/enums/transaction-status';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
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

it('exposes the decline reason SISP sent instead of the raw merchant response', async () => {
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

  const attempt = await sisp.models.transactionAttempts.createFromTransaction(created);

  await sisp.models.transactionAttempts.update(attempt.id, {
    status: TransactionStatus.Failed,
    message_type: '6',
    callback_payload: callbackPayloadFrom({
      messageType: '6',
      merchantRespErrorCode: 'C',
      merchantRespErrorDescription: 'Transaction processed with error',
      merchantRespErrorDetail: 'Insufficient funds',
      merchantRespAdditionalErrorMessage: 'Saldo do cartão insuficiente',
    }),
  });

  const result = await sisp.handlers.handleTransactionStatus(statusRequest(), created.merchant_ref);
  const data = result.type === 'json' ? (result.data as Record<string, unknown>) : {};

  expect(data.detail).toBe('Saldo do cartão insuficiente');
  expect(data.error).toMatchObject({
    code: 'C',
    description: 'Transaction processed with error',
    detail: 'Insufficient funds',
    customerMessage: 'Saldo do cartão insuficiente',
  });
});

it('rate limits status lookups per IP', async () => {
  const limited = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    rateLimiting: { perIpStatus: { limit: 2, windowSeconds: 3600 } },
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

it('does not spend the payment per-IP budget on status polling', async () => {
  const polls = 120;

  for (let index = 0; index < polls; index += 1) {
    const result = await sisp.handlers.handleTransactionStatus(statusRequest(), 'x');

    expect(result.type === 'json' ? result.status : 0).toBe(404);
  }
});

it('keeps status polling inside its own bucket when the payment limit is tight', async () => {
  const limited = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    rateLimiting: { perIp: { limit: 1, windowSeconds: 3600 } },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  try {
    for (let index = 0; index < 5; index += 1) {
      const result = await limited.handlers.handleTransactionStatus(statusRequest(), 'x');

      expect(result.type === 'json' ? result.status : 0).toBe(404);
    }
  } finally {
    await limited.destroy();
  }
});

it('leaves status lookups unlimited when perIpStatus is disabled', async () => {
  const limited = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    rateLimiting: { perIpStatus: { enabled: false, limit: 1 } },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  try {
    for (let index = 0; index < 5; index += 1) {
      const result = await limited.handlers.handleTransactionStatus(statusRequest(), 'x');

      expect(result.type === 'json' ? result.status : 0).toBe(404);
    }
  } finally {
    await limited.destroy();
  }
});

it('lets the adapter deny status lookups through authorizeTransactionStatus', async () => {
  const app = express();

  app.use('/sisp', sispRoutes(sisp, { authorizeTransactionStatus: () => false }));

  await request(app).get('/sisp/transactions/R1').expect(403);
});

it('applies the authorize hook after the rate limit inside the handler', async () => {
  const result = await sisp.handlers.handleTransactionStatus(statusRequest(), 'x', () => false);

  expect(result.type === 'json' ? result.status : 0).toBe(403);
});
