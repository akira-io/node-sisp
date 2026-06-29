import Fastify, { type FastifyInstance } from 'fastify';
import qs from 'qs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/create-sisp';
import { sispFastifyPlugin } from '../../src/fastify';
import type { Sisp } from '../../src/sisp';
import { extractForm } from '../helpers/auto-submit-form';

let sisp: Sisp;
let app: FastifyInstance;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  app = Fastify();
  await app.register(sispFastifyPlugin, { sisp, prefix: '/sisp' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await sisp.destroy();
});

function postForm(url: string, fields: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: qs.stringify(fields),
  });
}

describe('fastify sandbox end-to-end payment flow', () => {
  it('completes a payment through payment, sandbox, and callback routes', async () => {
    const completed = vi.fn();
    sisp.on('payment:completed', completed);

    const paymentResponse = await postForm('/sisp/payment', {
      amount: '1500',
      customer_name: 'Kid',
      customer_email: 'kid@akira.cv',
      items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1500 }],
    });

    expect(paymentResponse.statusCode).toBe(200);

    const paymentForm = extractForm(paymentResponse.body);

    expect(paymentForm.action).toContain('/sisp/sandbox?');
    expect(paymentForm.action).toContain('FingerPrint=');

    const sandboxResponse = await postForm(paymentForm.action, paymentForm.fields);

    expect(sandboxResponse.statusCode).toBe(200);

    const callbackForm = extractForm(sandboxResponse.body);
    const callbackResponse = await postForm(callbackForm.action, callbackForm.fields);

    expect(callbackResponse.statusCode).toBe(302);

    const location = callbackResponse.headers.location as string;

    expect(location).toMatch(/^\/sisp\/callback\?/);
    expect(location).toContain('transaction=');
    expect(location).toContain('signature=');
    expect(location).not.toContain('ref=');

    const resultResponse = await app.inject({ method: 'GET', url: location });

    expect(resultResponse.statusCode).toBe(200);

    const result = resultResponse.json();

    expect(result.transaction.status).toBe('completed');
    expect(result.invoice.status).toBe('paid');
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid payment input with validation errors', async () => {
    const response = await postForm('/sisp/payment', { amount: '100' });

    expect(response.statusCode).toBe(422);
    expect(response.json().errors.items).toBeDefined();
  });

  it('serves the country catalog and hides the sandbox in production', async () => {
    const countries = await app.inject({ method: 'GET', url: '/sisp/countries' });

    expect(countries.statusCode).toBe(200);
    expect(countries.json().cv.numeric).toBe('132');

    const production = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      url: 'https://gateway.vinti4.test/payment',
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });
    const productionApp = Fastify();
    await productionApp.register(sispFastifyPlugin, { sisp: production, prefix: '/sisp' });

    const hidden = await productionApp.inject({ method: 'GET', url: '/sisp/sandbox' });

    expect(hidden.statusCode).toBe(404);
    await productionApp.close();
    await production.destroy();
  });

  it('cancels through the signed route', async () => {
    const transaction = await sisp.models.transactions.create({
      merchantRef: 'R-cancel',
      merchantSession: 'S-cancel',
      amount: 100,
    });

    const response = await app.inject({
      method: 'GET',
      url: sisp.signedCancelUrl(transaction.merchant_ref),
    });

    expect(response.statusCode).toBe(302);
    expect((await sisp.models.transactions.findById(transaction.id))?.status).toBe('cancelled');
  });

  it('guards the refund route behind the authorization hook', async () => {
    const transaction = await sisp.models.transactions.create({
      merchantRef: 'R-refund',
      merchantSession: 'S-refund',
      amount: 100,
    });
    const completed = await sisp.models.transactions.update(transaction.id, {
      status: 'completed',
      transaction_id: '123',
      response_code: '42',
    });

    const denied = await postForm(`/sisp/refund/${completed.id}`, { amount: '100' });

    expect(denied.statusCode).toBe(403);

    const open = Fastify();
    await open.register(sispFastifyPlugin, {
      sisp,
      authorizeRefund: () => true,
      prefix: '/sisp',
    });

    const refunded = await open.inject({
      method: 'POST',
      url: `/sisp/refund/${completed.id}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: qs.stringify({ amount: '100' }),
    });

    expect(refunded.statusCode).toBe(200);
    expect(refunded.json().transaction.status).toBe('refunded');
    await open.close();
  });
});
