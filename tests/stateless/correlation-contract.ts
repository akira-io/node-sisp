import { beforeEach, describe, expect, it } from 'vitest';
import type { PaymentCorrelationStore } from '../../src/core/contracts/payment-correlation-store';
import { CallbackRejectionReasons } from '../../src/domain/enums/callback-rejection-reason';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import type { PaymentRequest } from '../../src/domain/value-objects/payment-request';

export function paymentRequestFixture(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    posID: '90000045',
    merchantRef: 'REF123',
    merchantSession: 'S20260730120000',
    amount: 1500,
    currency: '132',
    is3DSec: '0',
    urlMerchantResponse: 'https://shop.test/sisp/callback',
    languageMessages: 'pt',
    timeStamp: '2026-07-30 12:00:00',
    fingerprintversion: '1',
    transactionCode: '1',
    fingerprint: 'abc',
    token: '',
    entityCode: '',
    referenceNumber: '',
    locale: 'pt_PT',
    purchaseRequest: '',
    ...overrides,
  };
}

export function runCorrelationStoreContract(
  name: string,
  makeStore: () => Promise<PaymentCorrelationStore> | PaymentCorrelationStore,
): void {
  describe(`PaymentCorrelationStore contract: ${name}`, () => {
    let store: PaymentCorrelationStore;

    beforeEach(async () => {
      store = await makeStore();
    });

    it('returns null for a pair it never recorded', async () => {
      expect(await store.find('MISSING', 'S1')).toBeNull();
    });

    it('finds what it recorded, keyed on ref and session together', async () => {
      await store.record(paymentRequestFixture());

      const found = await store.find('REF123', 'S20260730120000');

      expect(found).not.toBeNull();
      expect(found?.amount).toBe(1500);
      expect(found?.currency).toBe('132');
      expect(found?.transactionCode).toBe('1');
      expect(await store.find('REF123', 'OTHER_SESSION')).toBeNull();
    });

    it('reports an unprocessed record as unprocessed', async () => {
      await store.record(paymentRequestFixture());

      const found = await store.find('REF123', 'S20260730120000');

      expect(found?.processedAt ?? null).toBeNull();
    });

    it('marks a record processed on a verified outcome', async () => {
      await store.record(paymentRequestFixture());
      await store.markProcessed('REF123', 'S20260730120000', {
        verified: true,
        reason: null,
        payload: callbackPayloadFrom({ messageType: '8' }),
      });

      const found = await store.find('REF123', 'S20260730120000');

      expect(found?.processedAt ?? null).not.toBeNull();
    });

    it('marks a record processed on a rejected outcome too', async () => {
      await store.record(paymentRequestFixture());
      await store.markProcessed('REF123', 'S20260730120000', {
        verified: false,
        reason: CallbackRejectionReasons.DetailsMismatch,
        payload: callbackPayloadFrom({ messageType: '6' }),
      });

      const found = await store.find('REF123', 'S20260730120000');

      expect(found?.processedAt ?? null).not.toBeNull();
    });

    it('tolerates markProcessed for a pair it never recorded', async () => {
      await expect(
        store.markProcessed('GHOST', 'S9', {
          verified: true,
          reason: null,
          payload: callbackPayloadFrom({ messageType: '8' }),
        }),
      ).resolves.toBeUndefined();
    });
  });
}
