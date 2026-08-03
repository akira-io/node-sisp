import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createStatelessSisp } from '../../src/application/create-stateless-sisp';
import { StatelessSispModule } from '../../src/presentation/nest';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

let app: INestApplication | null = null;

const paymentBody = {
  amount: '1500',
  customer_email: 'kid@akira.cv',
  items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1500 }],
};

async function boot(
  correlation: InMemoryPaymentCorrelationStore | null,
): Promise<INestApplication> {
  const sisp = createStatelessSisp({
    posId: '90000045',
    posAutCode: 'code',
    sandbox: true,
    appKey: 'app-key',
    baseUrl: 'https://shop.test',
    ...(correlation === null ? {} : { correlation }),
  });
  const moduleRef = await Test.createTestingModule({
    imports: [StatelessSispModule.forRoot({ sisp })],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useLogger(false);
  await app.init();

  return app;
}

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('StatelessSispModule', () => {
  it('serves the country list', async () => {
    const nest = await boot(null);

    await supertest(nest.getHttpServer()).get('/sisp/countries').expect(200);
  });

  it('records the payment and renders the form', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const nest = await boot(correlation);

    await supertest(nest.getHttpServer())
      .post('/sisp/payment')
      .send(paymentBody)
      .expect(200)
      .expect('Content-Type', /html/);

    expect(correlation.recorded).toHaveLength(1);
  });

  it('surfaces CorrelationRequiredError as a 500 when no store is configured', async () => {
    const nest = await boot(null);

    await supertest(nest.getHttpServer()).post('/sisp/payment').send(paymentBody).expect(500);
  });

  it('does not expose the stateful routes', async () => {
    const nest = await boot(new InMemoryPaymentCorrelationStore());

    await supertest(nest.getHttpServer()).get('/sisp/cancel').expect(404);
    await supertest(nest.getHttpServer()).get('/sisp/transactions/REF1').expect(404);
  });
});
