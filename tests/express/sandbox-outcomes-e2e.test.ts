import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { sispRoutes } from '../../src/presentation/express';
import { extractForm } from '../helpers/auto-submit-form';

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

async function paymentForm() {
  const response = await request(app)
    .post('/sisp/payment')
    .type('form')
    .send({
      amount: '1500',
      customer_email: 'kid@akira.cv',
      'items[0][product_name]': 'Plano Pro',
      'items[0][quantity]': '2',
      'items[0][unit_price]': '750',
      'items[0][total_price]': '1500',
    })
    .expect(200);

  return extractForm(response.text);
}

async function sandboxCallbackForm(status: string) {
  const form = await paymentForm();
  const sandboxResponse = await request(app)
    .post(form.action)
    .type('form')
    .send({ ...form.fields, status })
    .expect(200);

  return extractForm(sandboxResponse.text);
}

describe('sandbox outcomes end to end', () => {
  it('cancels the transaction when the sandbox posts a cancellation', async () => {
    const rejected = vi.fn();
    sisp.on('callback:rejected', rejected);

    const callbackForm = await sandboxCallbackForm('cancelled');

    expect(callbackForm.fields.UserCancelled).toBe('true');
    expect(callbackForm.fields.messageType).toBeUndefined();
    expect(callbackForm.fields.resultFingerPrint).toBeUndefined();

    await request(app).post('/sisp/callback').type('form').send(callbackForm.fields).expect(302);

    const transaction = await sisp.models.transactions.findByRef(
      callbackForm.fields.merchantRef as string,
    );

    expect(transaction?.status).toBe('cancelled');
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it('rejects the tampered sandbox callback without completing the transaction', async () => {
    const completed = vi.fn();
    const rejected = vi.fn();

    sisp.on('payment:completed', completed);
    sisp.on('callback:rejected', rejected);

    const callbackForm = await sandboxCallbackForm('tampered');

    await request(app).post('/sisp/callback').type('form').send(callbackForm.fields).expect(302);

    const transaction = await sisp.models.transactions.findByRef(
      callbackForm.fields.merchantRespMerchantRef as string,
    );

    expect(transaction).toBeDefined();
    expect(transaction?.status).toBe('pending');
    expect(completed).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it('completes the payment when the chooser form is submitted', async () => {
    const completed = vi.fn();
    sisp.on('payment:completed', completed);

    const form = await paymentForm();
    const chooser = await request(app).post(form.action).type('form').send(form.fields).expect(200);

    const chosen = extractForm(chooser.text);
    const callbackPage = await request(app)
      .post(chosen.action)
      .type('form')
      .send({ ...chosen.fields, status: 'success' })
      .expect(200);

    const callbackForm = extractForm(callbackPage.text);

    await request(app).post(callbackForm.action).type('form').send(callbackForm.fields).expect(302);

    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed.mock.calls[0]?.[0]?.transaction.merchant_ref).toBe(form.fields.merchantRef);
  });

  it('offers every outcome when the sandbox is posted without a status', async () => {
    const paymentResponse = await request(app)
      .post('/sisp/payment')
      .type('form')
      .send({
        amount: '1500',
        customer_email: 'kid@akira.cv',
        'items[0][product_name]': 'Plano Pro',
        'items[0][quantity]': '2',
        'items[0][unit_price]': '750',
        'items[0][total_price]': '1500',
      })
      .expect(200);

    const paymentForm = extractForm(paymentResponse.text);
    const chooser = await request(app)
      .post(paymentForm.action)
      .type('form')
      .send(paymentForm.fields)
      .expect(200);

    expect(chooser.text).not.toContain('onload=');
    expect(chooser.text).toContain(paymentForm.fields.merchantRef as string);

    for (const status of ['success', 'failed', 'cancelled', 'tampered']) {
      expect(chooser.text).toContain(`value='${status}'`);
    }
  });
});
