import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';

let sisp: Sisp | null = null;

afterEach(async () => {
  await sisp?.destroy();
  sisp = null;
});

function baseConfig(onError: (eventName: string, error: unknown) => void) {
  return {
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    onEventListenerError: onError,
    database: { client: 'better-sqlite3' as const, connection: { filename: ':memory:' } },
  };
}

function paymentRequest(): HttpRequestInfo {
  return {
    ip: '10.0.0.1',
    method: 'POST',
    path: '/sisp/payment',
    headers: { 'user-agent': 'vitest' },
    query: {},
    body: {
      amount: 1500,
      items: [{ product_name: 'Bilhete', quantity: 1, unit_price: 1500, total_price: 1500 }],
    },
  };
}

function callbackRequest(body: Record<string, unknown>): HttpRequestInfo {
  return {
    ip: '10.0.0.1',
    method: 'POST',
    path: '/sisp/callback',
    headers: { 'user-agent': 'vitest' },
    query: {},
    body,
  };
}

function signedCallbackBody(merchantRef: string, merchantSession: string): Record<string, unknown> {
  const body = {
    messageType: '8',
    merchantRespCP: '01',
    merchantRespTid: 'TID-12345',
    merchantRespMerchantRef: merchantRef,
    merchantRespMerchantSession: merchantSession,
    merchantRespPurchaseAmount: '1500',
    merchantResp: '00',
    merchantRespTimeStamp: '2026-06-12 10:00:05',
    posID: '90051',
    currency: '132',
    transactionCode: '1',
  };
  const fingerprint = generateCallbackFingerprint(
    computeToken('TEST_POS_AUT_CODE'),
    callbackPayloadFrom(body),
  );

  return { ...body, resultFingerPrint: fingerprint };
}

describe('HTTP side effect errors', () => {
  it('reports invoice stub failures without breaking payment creation', async () => {
    const onError = vi.fn();
    sisp = await createSisp(baseConfig(onError));

    await sisp.db.schema.dropTable(sisp.config.tables.invoices);

    const response = await sisp.handlers.handlePayment(paymentRequest());

    expect(response.type).toBe('html');
    expect(onError).toHaveBeenCalledWith('payment:pending', expect.any(Error));
  });

  it('reports callback metadata failures without breaking the redirect', async () => {
    const onError = vi.fn();
    sisp = await createSisp(baseConfig(onError));
    const transaction = await sisp.models.transactions.create({
      merchantRef: 'R20260612100000',
      merchantSession: 'S20260612100000',
      amount: 1500,
      currency: '132',
      transactionCode: '1',
    });

    await sisp.models.transactionAttempts.createFromTransaction(transaction);
    await sisp.db.schema.dropTable(sisp.config.tables.requestMetadata);

    const response = await sisp.handlers.handleCallback(
      callbackRequest(signedCallbackBody(transaction.merchant_ref, transaction.merchant_session)),
    );
    const stored = await sisp.models.transactions.findById(transaction.id);

    expect(response.type).toBe('redirect');
    expect(stored?.status).toBe('completed');
    expect(onError).toHaveBeenCalledWith('payment:completed', expect.any(Error));
  });
});
