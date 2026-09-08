import formbody from '@fastify/formbody';
import Fastify, { type FastifyInstance } from 'fastify';
import qs from 'qs';
import { describe, expect, it } from 'vitest';
import { createStatelessSisp } from '../../src/application/create-stateless-sisp';
import { statelessSispFastifyPlugin } from '../../src/presentation/fastify';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

const paymentBody = {
  amount: '1500',
  customer_email: 'kid@akira.cv',
  items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1500 }],
};

async function server(
  correlation: InMemoryPaymentCorrelationStore | null,
): Promise<FastifyInstance> {
  const sisp = createStatelessSisp({
    posId: '90000045',
    posAutCode: 'code',
    sandbox: true,
    appKey: 'app-key-with-thirty-two-characters!',
    baseUrl: 'https://shop.test',
    ...(correlation === null ? {} : { correlation }),
  });
  const app = Fastify();

  await app.register(statelessSispFastifyPlugin, { sisp, prefix: '/sisp' });
  await app.ready();

  return app;
}

describe('statelessSispFastifyPlugin', () => {
  it('serves the country list', async () => {
    const app = await server(null);

    expect((await app.inject({ method: 'GET', url: '/sisp/countries' })).statusCode).toBe(200);

    await app.close();
  });

  it('records the payment and renders the form', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const app = await server(correlation);

    const response = await app.inject({
      method: 'POST',
      url: '/sisp/payment',
      payload: paymentBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(correlation.recorded).toHaveLength(1);

    await app.close();
  });

  it('does not register the payment routes without a correlation store', async () => {
    const app = await server(null);

    expect(
      (await app.inject({ method: 'POST', url: '/sisp/payment', payload: paymentBody })).statusCode,
    ).toBe(404);

    await app.close();
  });

  it('404s the stateful routes', async () => {
    const app = await server(new InMemoryPaymentCorrelationStore());

    expect((await app.inject({ method: 'GET', url: '/sisp/cancel' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/sisp/transactions/REF1' })).statusCode).toBe(
      404,
    );

    await app.close();
  });

  it('does not register the callback GET route without an app key', async () => {
    const sisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      sandbox: true,
      baseUrl: 'https://shop.test',
    });
    const app = Fastify();

    await app.register(statelessSispFastifyPlugin, { sisp, prefix: '/sisp' });
    await app.ready();

    expect((await app.inject({ method: 'GET', url: '/sisp/callback' })).statusCode).toBe(404);

    await app.close();
  });

  it('registers the sandbox routes in sandbox mode', async () => {
    const app = await server(null);

    const getResponse = await app.inject({ method: 'GET', url: '/sisp/sandbox' });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.headers['content-type']).toMatch(/html/);

    const postResponse = await app.inject({ method: 'POST', url: '/sisp/sandbox' });

    expect(postResponse.statusCode).toBe(200);
    expect(postResponse.headers['content-type']).toMatch(/html/);

    await app.close();
  });

  it('does not register the sandbox routes outside sandbox mode', async () => {
    const sisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      appKey: 'app-key-with-thirty-two-characters!',
      baseUrl: 'https://shop.test',
    });
    const app = Fastify();

    await app.register(statelessSispFastifyPlugin, { sisp, prefix: '/sisp' });
    await app.ready();

    expect((await app.inject({ method: 'GET', url: '/sisp/sandbox' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/sisp/sandbox' })).statusCode).toBe(404);

    await app.close();
  });

  it('accepts a form-urlencoded POST /payment when formbody is not pre-registered', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const app = await server(correlation);

    const response = await app.inject({
      method: 'POST',
      url: '/sisp/payment',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: qs.stringify(paymentBody),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(correlation.recorded).toHaveLength(1);

    await app.close();
  });

  it('does not throw when formbody is already registered by the consumer', async () => {
    const sisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      sandbox: true,
      appKey: 'app-key-with-thirty-two-characters!',
      baseUrl: 'https://shop.test',
      correlation: new InMemoryPaymentCorrelationStore(),
    });
    const app = Fastify();

    await app.register(formbody);
    app.register(statelessSispFastifyPlugin, { sisp, prefix: '/sisp' });

    await expect(app.ready()).resolves.not.toThrow();

    await app.close();
  });
});
