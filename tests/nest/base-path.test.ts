import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import { createStatelessSisp } from '../../src/application/create-stateless-sisp';
import type { Sisp } from '../../src/application/sisp';
import { SispModule, StatelessSispModule } from '../../src/presentation/nest';
import { extractForm } from '../helpers/auto-submit-form';
import { InMemoryPaymentCorrelationStore } from '../stateless/in-memory-correlation-store';

let sisp: Sisp | null = null;
let app: INestApplication | null = null;

const paymentFields = {
  amount: '1500',
  customer_email: 'kid@akira.cv',
  'items[0][product_name]': 'Plano Pro',
  'items[0][quantity]': '2',
  'items[0][unit_price]': '750',
  'items[0][total_price]': '1500',
};

async function boot(
  basePath: string,
  options: { globalPrefix?: string } = {},
): Promise<INestApplication> {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    basePath,
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [SispModule.forRoot({ sisp, authorizeRefund: () => true, ...options })],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useLogger(false);

  if (options.globalPrefix !== undefined) {
    app.setGlobalPrefix(options.globalPrefix);
  }

  await app.init();

  return app;
}

afterEach(async () => {
  await app?.close();
  await sisp?.destroy();
  app = null;
  sisp = null;
});

describe('nest adapter honours basePath', () => {
  it('mounts the controller where the generated URLs point', async () => {
    const nest = await boot('/pay');
    const server = nest.getHttpServer();

    const paymentResponse = await request(server)
      .post('/pay/payment')
      .type('form')
      .send(paymentFields)
      .expect(200);

    const paymentForm = extractForm(paymentResponse.text);

    expect(paymentForm.action).toContain('/pay/sandbox?');

    const sandboxResponse = await request(server)
      .post(paymentForm.action)
      .type('form')
      .send(paymentForm.fields)
      .expect(200);

    const callbackForm = extractForm(sandboxResponse.text);

    expect(callbackForm.action).toContain('/pay/callback');

    const callbackResponse = await request(server)
      .post(callbackForm.action)
      .type('form')
      .send(callbackForm.fields)
      .expect(302);

    const result = await request(server)
      .get(callbackResponse.headers.location as string)
      .expect(200);

    expect(result.body.transaction.status).toBe('completed');
  });

  it('serves the signed cancel URL it hands out', async () => {
    const nest = await boot('/pay');
    const instance = sisp as Sisp;

    await instance.models.transactions.create({
      merchantRef: 'R-cancel',
      merchantSession: 'S-cancel',
      amount: 100,
    });

    const cancelUrl = instance.signedCancelUrl('R-cancel');

    expect(cancelUrl).toContain('/pay/cancel?');

    await request(nest.getHttpServer()).get(cancelUrl).expect(302);

    const cancelled = await instance.models.transactions.findByRef('R-cancel');

    expect(cancelled?.status).toBe('cancelled');
  });

  it('serves the signed retry URL it hands out', async () => {
    const nest = await boot('/pay');
    const instance = sisp as Sisp;

    const transaction = await instance.models.transactions.create({
      merchantRef: 'R-retry',
      merchantSession: 'S-retry',
      amount: 100,
    });
    await instance.models.transactions.update(transaction.id, { status: 'failed' });

    const retryUrl = instance.signedRetryUrl(transaction.id);

    expect(retryUrl).toContain('/pay/retry-payment?');

    await request(nest.getHttpServer()).get(retryUrl).expect(200);
  });

  it('does not leave the routes on the old default path', async () => {
    const nest = await boot('/pay');

    await request(nest.getHttpServer()).get('/sisp/countries').expect(404);
  });

  it('serves a base path written with a trailing slash', async () => {
    const nest = await boot('/pay/');
    const server = nest.getHttpServer();

    const paymentResponse = await request(server)
      .post('/pay/payment')
      .type('form')
      .send(paymentFields)
      .expect(200);

    const paymentForm = extractForm(paymentResponse.text);

    expect(paymentForm.action).toContain('/pay/sandbox?');
    expect(paymentForm.action).not.toContain('//sandbox');

    await request(server)
      .post(paymentForm.action)
      .type('form')
      .send(paymentForm.fields)
      .expect(200);
  });

  it('leaves room for the Nest global prefix instead of applying it twice', async () => {
    const nest = await boot('/api/sisp', { globalPrefix: 'api' });
    const server = nest.getHttpServer();

    const paymentResponse = await request(server)
      .post('/api/sisp/payment')
      .type('form')
      .send(paymentFields)
      .expect(200);

    const paymentForm = extractForm(paymentResponse.text);

    expect(paymentForm.action).toContain('/api/sisp/sandbox?');

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

    await request(server).get('/api/api/sisp/countries').expect(404);
  });

  it('refuses a base path that does not carry the global prefix', async () => {
    sisp = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      appKey: 'app-key',
      basePath: '/sisp',
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    expect(() => SispModule.forRoot({ sisp: sisp as Sisp, globalPrefix: 'api' })).toThrow(
      /must start with the Nest global prefix/,
    );
  });
});

describe('stateless nest adapter honours basePath', () => {
  async function bootStateless(
    basePath: string,
    options: { globalPrefix?: string } = {},
  ): Promise<INestApplication> {
    const stateless = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      sandbox: true,
      appKey: 'app-key',
      baseUrl: 'https://shop.test',
      basePath,
      correlation: new InMemoryPaymentCorrelationStore(),
    });

    const moduleRef = await Test.createTestingModule({
      imports: [StatelessSispModule.forRoot({ sisp: stateless, ...options })],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);

    if (options.globalPrefix !== undefined) {
      app.setGlobalPrefix(options.globalPrefix);
    }

    await app.init();

    return app;
  }

  it('mounts the controller at the configured base path', async () => {
    const nest = await bootStateless('/pay');

    await request(nest.getHttpServer()).get('/pay/countries').expect(200);
    await request(nest.getHttpServer()).get('/sisp/countries').expect(404);
  });

  it('leaves room for the Nest global prefix', async () => {
    const nest = await bootStateless('/api/sisp', { globalPrefix: 'api' });

    await request(nest.getHttpServer()).get('/api/sisp/countries').expect(200);
    await request(nest.getHttpServer()).get('/api/api/sisp/countries').expect(404);
  });

  it('refuses a base path that does not carry the global prefix', async () => {
    await expect(bootStateless('/sisp', { globalPrefix: 'api' })).rejects.toThrow(
      /must start with the Nest global prefix/,
    );
  });
});
