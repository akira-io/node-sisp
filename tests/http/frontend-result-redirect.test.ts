import { afterEach, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { callbackPayloadToFormFields } from '../../src/domain/value-objects/callback-payload';

let sisp: Sisp;

async function seedAndCallback(frontendResultUrl?: string) {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    frontendResultUrl,
    baseUrl: 'https://app.example.cv',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  const transaction = await sisp.models.transactions.create({
    merchantRef: 'R1',
    merchantSession: 'S1',
    amount: 1500,
  });
  await sisp.models.transactionAttempts.createFromTransaction(transaction);

  const payload = sisp.generateSandboxPayload({
    amount: 1500,
    merchantRef: 'R1',
    merchantSession: 'S1',
  });

  return sisp.handlers.handleCallback({
    ip: '127.0.0.1',
    method: 'POST',
    path: '/sisp/callback',
    headers: {},
    query: {},
    body: callbackPayloadToFormFields(payload),
  });
}

afterEach(() => sisp.destroy());

it('redirects to the frontend result URL with the ref when configured', async () => {
  const result = await seedAndCallback('https://spa.example.cv/result');

  expect(result.type).toBe('redirect');

  if (result.type === 'redirect') {
    expect(result.location).toBe('https://spa.example.cv/result?ref=R1');
  }
});

it('redirects to the signed JSON result page when no frontend URL is set', async () => {
  const result = await seedAndCallback();

  expect(result.type).toBe('redirect');

  if (result.type === 'redirect') {
    expect(result.location).toContain('/sisp/callback');
    expect(result.location).toContain('signature=');
    expect(result.location).toContain('transaction=');
  }
});
