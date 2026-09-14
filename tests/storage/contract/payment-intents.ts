import { describe, expect, it } from 'vitest';
import type { GetContractSubject } from './types';

export function runPaymentIntentsContract(getSubject: GetContractSubject): void {
  describe('paymentIntents.reserve / findByKey', () => {
    it('reserves a key once and stores the request hash', async () => {
      const { storage } = getSubject();
      expect(await storage.paymentIntents.reserve('KEY-CONTRACT-1', 'hash-a')).toBe(true);
      expect(await storage.paymentIntents.reserve('KEY-CONTRACT-1', 'hash-b')).toBe(false);

      const intent = await storage.paymentIntents.findByKey('KEY-CONTRACT-1');

      expect(intent?.status).toBe('processing');
      expect(intent?.request_hash).toBe('hash-a');
      expect(intent?.transaction_id).toBeNull();
    });

    it('reclaims a failed key without a transaction and refreshes the request hash', async () => {
      const { storage } = getSubject();
      await storage.paymentIntents.reserve('KEY-CONTRACT-2', 'hash-a');
      await storage.paymentIntents.fail('KEY-CONTRACT-2', 'boom');

      expect(await storage.paymentIntents.reserve('KEY-CONTRACT-2', 'hash-b')).toBe(true);
      expect((await storage.paymentIntents.findByKey('KEY-CONTRACT-2'))?.request_hash).toBe(
        'hash-b',
      );
    });
  });
}
