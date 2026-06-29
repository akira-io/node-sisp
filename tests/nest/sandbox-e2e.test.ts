import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { SISP, SispModule } from '../../src/presentation/nest';
import { extractForm } from '../helpers/auto-submit-form';

let sisp: Sisp;
let app: INestApplication;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [SispModule.forRoot({ sisp, authorizeRefund: () => true })],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
});

afterEach(async () => {
  await app.close();
  await sisp.destroy();
});

describe('nest sandbox end-to-end payment flow', () => {
  it('completes a payment through payment, sandbox, and callback routes', async () => {
    const completed = vi.fn();
    sisp.on('payment:completed', completed);
    const server = app.getHttpServer();

    const paymentResponse = await request(server)
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

    expect(paymentForm.action).toContain('/sisp/sandbox?');

    const sandboxResponse = await request(server)
      .post(paymentForm.action)
      .type('form')
      .send(paymentForm.fields)
      .expect(200);

    const callbackForm = extractForm(sandboxResponse.text);

    const callbackResponse = await request(server)
      .post(callbackForm.action)
      .type('form')
      .send(callbackForm.fields)
      .expect(302);

    const result = await request(server)
      .get(callbackResponse.headers.location as string)
      .expect(200);

    expect(result.body.transaction.status).toBe('completed');
    expect(result.body.invoice.status).toBe('paid');
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('exposes the Sisp instance through the DI token', () => {
    expect(app.get<Sisp>(SISP)).toBe(sisp);
  });

  it('rejects invalid payment input with validation errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/sisp/payment')
      .type('form')
      .send({ amount: '100' })
      .expect(422);

    expect(response.body.errors.items).toBeDefined();
  });

  it('processes authorized refunds through the module options', async () => {
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

    const response = await request(app.getHttpServer())
      .post(`/sisp/refund/${completed.id}`)
      .type('form')
      .send({ amount: '100' })
      .expect(200);

    expect(response.body.transaction.status).toBe('refunded');
  });

  it('serves the country catalog', async () => {
    const response = await request(app.getHttpServer()).get('/sisp/countries').expect(200);

    expect(response.body.cv.numeric).toBe('132');
  });
});
