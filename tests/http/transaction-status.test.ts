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

it('returns the hydrated transaction status as JSON', async () => {
  const created = await sisp.models.transactions.create({
    merchantRef: 'R20260612100000',
    merchantSession: 'S20260612100000',
    amount: 1500,
  });

  const result = await sisp.handlers.handleTransactionStatus(created.merchant_ref);

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
  const result = await sisp.handlers.handleTransactionStatus('does-not-exist');

  expect(result.type).toBe('json');

  if (result.type === 'json') {
    expect(result.status).toBe(404);
  }
});
