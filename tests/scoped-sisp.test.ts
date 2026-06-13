import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../src/create-sisp';
import { generatePaymentFingerprint } from '../src/fingerprints/payment-fingerprint';
import { computeToken } from '../src/fingerprints/token';
import type { Sisp } from '../src/sisp';

let sisp: Sisp;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
});

afterEach(async () => {
  await sisp.destroy();
});

const merchantCredentials = {
  posId: '70001',
  posAutCode: 'MERCHANT_TWO_CODE',
  sandbox: true,
  url: 'https://gateway.merchant-two.test',
};

describe('forCredentials', () => {
  it('signs payment requests with the scoped credentials', () => {
    const scoped = sisp.forCredentials(merchantCredentials);

    const request = scoped
      .payment()
      .amount(100)
      .merchantRef('R1')
      .merchantSession('S1')
      .timeStamp('2026-06-12 10:00:00')
      .build();

    expect(request.posID).toBe('70001');
    expect(request.fingerprint).toBe(
      generatePaymentFingerprint(computeToken('MERCHANT_TWO_CODE'), {
        amount: 100,
        timeStamp: '2026-06-12 10:00:00',
        merchantRef: 'R1',
        merchantSession: 'S1',
        posID: '70001',
        currency: '132',
        transactionCode: '1',
      }),
    );
  });

  it('validates callbacks against the scoped posAutCode', () => {
    const scoped = sisp.forCredentials(merchantCredentials);
    const payload = scoped.generateSandboxPayload({ amount: 100 });

    expect(scoped.validateCallback(payload)).toBe(true);
    expect(sisp.validateCallback(payload)).toBe(false);
  });

  it('processes callbacks for transactions of the scoped merchant', async () => {
    const scoped = sisp.forCredentials(merchantCredentials);

    await sisp.models.transactions.create({
      merchantRef: 'R-scoped',
      merchantSession: 'S-scoped',
      amount: 100,
    });

    const payload = scoped.generateSandboxPayload({
      amount: 100,
      merchantRef: 'R-scoped',
      merchantSession: 'S-scoped',
    });

    const transaction = await scoped.handlePaymentCallback(payload);

    expect(transaction.status).toBe('completed');
  });

  it('queries the transaction status with the scoped credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ result: true, transactionSuccess: true }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const withPortal = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      transactionStatus: { portalId: 'portal', portalPassword: 'pass' },
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    await withPortal.forCredentials(merchantCredentials).queryTransactionStatus('R1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(JSON.parse(init.body as string)).toMatchObject({
      posID: '70001',
      posAuthCode: 'MERCHANT_TWO_CODE',
    });

    vi.unstubAllGlobals();
    await withPortal.destroy();
  });
});
