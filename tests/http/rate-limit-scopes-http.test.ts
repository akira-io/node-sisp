import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import { requireKnex } from '../helpers/knex';

let sisp: Sisp;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    rateLimiting: {
      perIp: { enabled: false },
      perMerchant: { enabled: true, limit: 3, windowSeconds: 3600 },
      perUser: { enabled: true, limit: 2, windowSeconds: 3600 },
    },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
});

afterEach(() => sisp.destroy());

function paymentRequest(email: string, ip: string): HttpRequestInfo {
  return {
    ip,
    method: 'POST',
    path: '/sisp/payment',
    headers: {},
    query: {},
    body: {
      amount: '1500',
      customer_email: email,
      items: [{ product_name: 'Pro', quantity: '1', unit_price: '1500', total_price: '1500' }],
    },
  };
}

function status(result: Awaited<ReturnType<Sisp['handlers']['handlePayment']>>): number {
  return result.type === 'json' ? result.status : 0;
}

describe('rate limit scopes over the payment handler', () => {
  it('rejects with 429 once the per-user window is exceeded, keyed on customer_email', async () => {
    expect(
      status(await sisp.handlers.handlePayment(paymentRequest('a@example.cv', '10.0.0.1'))),
    ).toBe(0);
    await sisp.handlers.handlePayment(paymentRequest('a@example.cv', '10.0.0.2'));

    expect(
      status(await sisp.handlers.handlePayment(paymentRequest('a@example.cv', '10.0.0.3'))),
    ).toBe(429);
  });

  it('never writes the customer email into the rate limit identifier', async () => {
    await sisp.handlers.handlePayment(paymentRequest('a@example.cv', '10.0.0.1'));

    const rows = await identifiers();

    expect(rows).not.toContain('a@example.cv');
    expect(rows).toContain('90051');
    expect(rows.some((value) => /^[0-9a-f]{64}$/.test(value))).toBe(true);
  });

  it('rejects with 429 once the per-merchant window is exceeded across customers', async () => {
    await sisp.handlers.handlePayment(paymentRequest('a@example.cv', '10.0.0.1'));
    await sisp.handlers.handlePayment(paymentRequest('b@example.cv', '10.0.0.2'));
    await sisp.handlers.handlePayment(paymentRequest('c@example.cv', '10.0.0.3'));

    expect(
      status(await sisp.handlers.handlePayment(paymentRequest('d@example.cv', '10.0.0.4'))),
    ).toBe(429);
  });
});

async function identifiers(): Promise<string[]> {
  const rows = (await requireKnex(sisp)(sisp.config.tables.rateLimits)) as {
    identifier: string;
  }[];

  return rows.map((row) => row.identifier);
}
