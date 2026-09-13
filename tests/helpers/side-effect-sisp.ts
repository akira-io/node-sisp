import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';

export type SideEffectErrorSpy = (sideEffect: string, error: unknown) => void;

export function sideEffectConfig(onSideEffectError: SideEffectErrorSpy) {
  return {
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    onSideEffectError,
    database: { client: 'better-sqlite3' as const, connection: { filename: ':memory:' } },
  };
}

export function createSideEffectSisp(onSideEffectError: SideEffectErrorSpy): Promise<Sisp> {
  return createSisp(sideEffectConfig(onSideEffectError));
}

export function paymentRequest(): HttpRequestInfo {
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

export function callbackRequest(body: Record<string, unknown>): HttpRequestInfo {
  return {
    ip: '10.0.0.1',
    method: 'POST',
    path: '/sisp/callback',
    headers: { 'user-agent': 'vitest' },
    query: {},
    body,
  };
}

export function signedCallbackBody(
  merchantRef: string,
  merchantSession: string,
): Record<string, unknown> {
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

export async function settledTransaction(sisp: Sisp, merchantRef: string, merchantSession: string) {
  const transaction = await sisp.models.transactions.create({
    merchantRef,
    merchantSession,
    amount: 1500,
    currency: '132',
    transactionCode: '1',
  });

  await sisp.models.transactionAttempts.createFromTransaction(transaction);

  return transaction;
}
