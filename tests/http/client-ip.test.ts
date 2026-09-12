import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { type HttpRequestInfo, headerValue } from '../../src/infrastructure/http/request-info';

let sisp: Sisp;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    rateLimiting: { perIp: { limit: 2, windowSeconds: 3600 }, perUser: { enabled: false } },
    security: { clientIp: (request) => headerValue(request, 'x-real-ip') },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
});

afterEach(() => sisp.destroy());

function paymentRequest(realIp: string | null, ip = '10.0.0.1'): HttpRequestInfo {
  return {
    ip,
    method: 'POST',
    path: '/sisp/payment',
    headers: realIp === null ? {} : { 'x-real-ip': realIp },
    query: {},
    body: {
      amount: '1500',
      customer_email: 'cliente@example.cv',
      items: [{ product_name: 'Pro', quantity: '1', unit_price: '1500', total_price: '1500' }],
    },
  };
}

describe('security.clientIp', () => {
  it('rate limits by the resolved client ip instead of the socket ip', async () => {
    await sisp.handlers.handlePayment(paymentRequest('203.0.113.1'));
    await sisp.handlers.handlePayment(paymentRequest('203.0.113.1'));

    const blocked = await sisp.handlers.handlePayment(paymentRequest('203.0.113.1'));
    const other = await sisp.handlers.handlePayment(paymentRequest('203.0.113.2'));

    expect(blocked.type === 'json' ? blocked.status : 0).toBe(429);
    expect(other.type).toBe('html');
  });

  it('stores the resolved client ip in the request metadata', async () => {
    const result = await sisp.handlers.handlePaymentIntent({
      ...paymentRequest('203.0.113.9'),
      path: '/sisp/payment/intent',
    });
    const ref = result.type === 'json' ? (result.data as { ref: string }).ref : '';
    const transaction = await sisp.models.transactions.findByRef(ref);
    const [metadata] = await sisp.storage.requestMetadata.listByTransaction(transaction?.id ?? 0);

    expect(metadata?.ip_address).toBe('203.0.113.9');
  });

  it('falls back to the socket ip when the resolver returns nothing', async () => {
    await sisp.handlers.handlePayment(paymentRequest(null));
    await sisp.handlers.handlePayment(paymentRequest('', '10.0.0.1'));

    const blocked = await sisp.handlers.handlePayment(paymentRequest(null));

    expect(blocked.type === 'json' ? blocked.status : 0).toBe(429);
  });

  it('skips per-ip limits and blacklist checks only when no ip exists at all', async () => {
    await sisp.models.blacklist.add({ type: 'ip', value: '', severity: 'high' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await sisp.handlers.handlePayment(paymentRequest(null, ''));

      expect(result.type).toBe('html');
    }
  });
});
