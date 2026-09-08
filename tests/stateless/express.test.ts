import express from 'express';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { createStatelessSisp } from '../../src/application/create-stateless-sisp';
import { statelessSispRoutes } from '../../src/presentation/express';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

const paymentBody = {
  amount: '1500',
  customer_email: 'kid@akira.cv',
  items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1500 }],
};

function app(correlation: InMemoryPaymentCorrelationStore | null) {
  const sisp = createStatelessSisp({
    posId: '90000045',
    posAutCode: 'code',
    sandbox: true,
    appKey: 'app-key-with-thirty-two-characters!',
    baseUrl: 'https://shop.test',
    ...(correlation === null ? {} : { correlation }),
  });
  const server = express();

  server.use('/sisp', statelessSispRoutes(sisp));

  return { server, sisp };
}

describe('statelessSispRoutes', () => {
  it('serves the country list', async () => {
    await supertest(app(null).server).get('/sisp/countries').expect(200);
  });

  it('renders the auto-submit form when a correlation store is configured', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();

    await supertest(app(correlation).server)
      .post('/sisp/payment')
      .send(paymentBody)
      .expect(200)
      .expect('Content-Type', /html/);

    expect(correlation.recorded).toHaveLength(1);
  });

  it('does not mount the payment routes without a correlation store', async () => {
    await supertest(app(null).server).post('/sisp/payment').send(paymentBody).expect(404);
    await supertest(app(null).server).post('/sisp/payment/intent').send(paymentBody).expect(404);
  });

  it('404s the stateful routes in every configuration', async () => {
    const { server } = app(new InMemoryPaymentCorrelationStore());

    await supertest(server).get('/sisp/retry-payment').expect(404);
    await supertest(server).get('/sisp/cancel').expect(404);
    await supertest(server).get('/sisp/transactions/REF123').expect(404);
    await supertest(server).post('/sisp/refund/1').expect(404);
  });

  it('redirects an unsigned GET callback instead of leaking a result', async () => {
    await supertest(app(null).server).get('/sisp/callback').expect(302);
  });

  it('does not mount the callback GET route without an app key', async () => {
    const sisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      sandbox: true,
      baseUrl: 'https://shop.test',
    });
    const server = express();

    server.use('/sisp', statelessSispRoutes(sisp));

    await supertest(server).get('/sisp/callback').expect(404);
  });

  it('mounts the sandbox routes in sandbox mode', async () => {
    await supertest(app(null).server)
      .get('/sisp/sandbox')
      .expect(200)
      .expect('Content-Type', /html/);

    await supertest(app(null).server)
      .post('/sisp/sandbox')
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it('does not mount the sandbox routes outside sandbox mode', async () => {
    const sisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      appKey: 'app-key-with-thirty-two-characters!',
      baseUrl: 'https://shop.test',
    });
    const server = express();

    server.use('/sisp', statelessSispRoutes(sisp));

    await supertest(server).get('/sisp/sandbox').expect(404);
    await supertest(server).post('/sisp/sandbox').expect(404);
  });
});
