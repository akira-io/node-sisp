import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/create-sisp';
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

function extractForm(html: string): { action: string; fields: Record<string, string> } {
  const actionMatch = html.match(/form action='([^']+)'/);
  const fields: Record<string, string> = {};

  for (const input of html.matchAll(/name='([^']+)' value='([^']*)'/g)) {
    fields[unescapeHtml(input[1] as string)] = unescapeHtml(input[2] as string);
  }

  return { action: unescapeHtml(actionMatch?.[1] ?? ''), fields };
}

function unescapeHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&amp;', '&');
}

async function runSandboxPayment(status?: string) {
  const paymentResponse = await request(app)
    .post('/sisp/payment')
    .type('form')
    .send({
      amount: '1500',
      customer_name: 'Kid',
      customer_email: 'kid@akira.cv',
      'items[0][product_name]': 'Plano Pro',
      'items[0][quantity]': '2',
      'items[0][unit_price]': '750',
      'items[0][total_price]': '1500',
    })
    .expect(200);

  const paymentForm = extractForm(paymentResponse.text);
  const [sandboxPath, sandboxQuery] = paymentForm.action.split('?');

  expect(sandboxPath).toBe('/sisp/sandbox');
  expect(sandboxQuery).toContain('FingerPrint=');
  expect(sandboxQuery).toContain('FingerPrintVersion=1');

  const sandboxResponse = await request(app)
    .post(paymentForm.action)
    .type('form')
    .send(status ? { ...paymentForm.fields, status } : paymentForm.fields)
    .expect(200);

  const callbackForm = extractForm(sandboxResponse.text);

  expect(callbackForm.action).toBe('/sisp/callback');

  const callbackResponse = await request(app)
    .post('/sisp/callback')
    .type('form')
    .send(callbackForm.fields)
    .expect(302);

  const location = callbackResponse.headers.location as string;

  expect(location).toMatch(/^\/sisp\/callback\?ref=R/);

  return request(app).get(location).expect(200);
}

describe('sandbox end-to-end payment flow', () => {
  it('completes a payment through payment, sandbox, and callback routes', async () => {
    const completed = vi.fn();
    sisp.on('payment:completed', completed);

    const result = await runSandboxPayment();

    expect(result.body.transaction.status).toBe('completed');
    expect(result.body.transaction.formatted_amount).toBe('1.500 ECV');
    expect(result.body.error).toBeNull();
    expect(result.body.invoice.status).toBe('paid');
    expect(completed).toHaveBeenCalledTimes(1);

    const transaction = completed.mock.calls[0]?.[0]?.transaction;
    const items = await sisp.models.transactionItems.listByTransaction(transaction.id);
    const logs = await sisp.models.transactionLogs.listByTransaction(transaction.id);

    expect(items).toHaveLength(1);
    expect(logs.some((entry) => entry.source === 'callback')).toBe(true);
  });

  it('marks a failed sandbox payment with structured error data', async () => {
    const failed = vi.fn();
    sisp.on('payment:failed', failed);

    const result = await runSandboxPayment('failed');

    expect(result.body.transaction.status).toBe('failed');
    expect(result.body.error.code).toBe('6');
    expect(result.body.error.category).toBe('system');
    expect(result.body.allowRetry).toBe(true);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid payment input with validation errors', async () => {
    const response = await request(app)
      .post('/sisp/payment')
      .type('form')
      .send({ amount: '100' })
      .expect(422);

    expect(response.body.errors.items).toBeDefined();
  });

  it('redirects user cancellations to the configured redirect URL', async () => {
    const response = await request(app)
      .post('/sisp/callback')
      .type('form')
      .send({ UserCancelled: 'true' })
      .expect(302);

    expect(response.headers.location).toBe('/');
  });

  it('redirects duplicate callback notifications without reprocessing', async () => {
    const completed = vi.fn();
    sisp.on('payment:completed', completed);

    await runSandboxPayment();

    const transaction = completed.mock.calls[0]?.[0]?.transaction;

    const replay = await request(app)
      .post('/sisp/callback')
      .type('form')
      .send({
        merchantRespMerchantRef: transaction.merchant_ref,
        merchantRespMerchantSession: transaction.merchant_session,
        merchantRespPurchaseAmount: '1500',
        messageType: '8',
      })
      .expect(302);

    expect(replay.headers.location).toBe('/');
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('serves the SISP country catalog', async () => {
    const response = await request(app).get('/sisp/countries').expect(200);

    expect(response.body.cv).toEqual({
      alpha2: 'CV',
      numeric: '132',
      name: 'Cabo Verde',
      flag: 'https://flagcdn.com/cv.svg',
    });
  });

  it('hides the sandbox route outside sandbox mode', async () => {
    const production = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      url: 'https://gateway.vinti4.test/payment',
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    const productionApp = express();
    productionApp.use('/sisp', sispRoutes(production));

    await request(productionApp).get('/sisp/sandbox').expect(404);
    await production.destroy();
  });
});
