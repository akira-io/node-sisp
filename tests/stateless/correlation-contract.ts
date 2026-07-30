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

    it('reports a pair it never recorded as missing', async () => {
      expect(await store.claim('MISSING', 'S1')).toEqual({ status: 'missing' });
    });

    it('claims what it recorded, keyed on ref and session together', async () => {
      await store.record(paymentRequestFixture());

      const claim = await store.claim('REF123', 'S20260730120000');

      expect(claim.status).toBe('claimed');
      expect(claim.status === 'claimed' ? claim.payment.amount : null).toBe(1500);
      expect(claim.status === 'claimed' ? claim.payment.currency : null).toBe('132');
      expect(claim.status === 'claimed' ? claim.payment.transactionCode : null).toBe('1');
    });

    it('does not claim a recorded ref under a different session', async () => {
      await store.record(paymentRequestFixture());

      expect(await store.claim('REF123', 'OTHER_SESSION')).toEqual({ status: 'missing' });
    });

    it('reports a second claim of the same pair as already processed', async () => {
      await store.record(paymentRequestFixture());

      expect((await store.claim('REF123', 'S20260730120000')).status).toBe('claimed');
      expect(await store.claim('REF123', 'S20260730120000')).toEqual({
        status: 'already_processed',
      });
    });

    it('yields exactly one claim under concurrent claims of the same pair', async () => {
      await store.record(paymentRequestFixture());

      const results = await Promise.all([
        store.claim('REF123', 'S20260730120000'),
        store.claim('REF123', 'S20260730120000'),
      ]);
      const statuses = results.map((result) => result.status).sort();

      expect(statuses).toEqual(['already_processed', 'claimed']);
    });

    it('records the outcome of a claimed pair, verified or rejected', async () => {
      await store.record(paymentRequestFixture());
      await store.claim('REF123', 'S20260730120000');

      await expect(
        store.markProcessed('REF123', 'S20260730120000', {
          verified: true,
          reason: null,
          payload: callbackPayloadFrom({ messageType: '8' }),
        }),
      ).resolves.toBeUndefined();

      await expect(
        store.markProcessed('REF123', 'S20260730120000', {
          verified: false,
          reason: CallbackRejectionReasons.DetailsMismatch,
          payload: callbackPayloadFrom({ messageType: '6' }),
        }),
      ).resolves.toBeUndefined();
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
