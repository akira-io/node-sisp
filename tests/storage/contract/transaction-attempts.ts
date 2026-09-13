import { describe, expect, it } from 'vitest';
import type { GetContractSubject } from './types';

export function runTransactionAttemptsContract(getSubject: GetContractSubject): void {
  describe('transactionAttempts.update', () => {
    it('writes an explicit null over a stored callback_received_at', async () => {
      const { storage } = getSubject();
      const tx = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-ATTEMPT',
        merchantSession: 'SES-CONTRACT-ATTEMPT',
        amount: 500,
      });

      const attempt = await storage.transactionAttempts.createFromTransaction(
        (await storage.transactions.findById(tx.id)) as NonNullable<
          Awaited<ReturnType<typeof storage.transactions.findById>>
        >,
      );

      const received = await storage.transactionAttempts.update(attempt.id, {
        status: 'completed',
        callback_received_at: new Date('2024-06-01T10:00:00.000Z').toISOString(),
      });

      expect(received.callback_received_at).not.toBeNull();

      const cleared = await storage.transactionAttempts.update(attempt.id, {
        status: 'pending',
        callback_received_at: null,
      });

      expect(cleared.callback_received_at).toBeNull();
    });

    it('leaves callback_received_at untouched when the field is absent', async () => {
      const { storage } = getSubject();
      const tx = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-ATTEMPT-KEEP',
        merchantSession: 'SES-CONTRACT-ATTEMPT-KEEP',
        amount: 500,
      });

      const attempt = await storage.transactionAttempts.createFromTransaction(
        (await storage.transactions.findById(tx.id)) as NonNullable<
          Awaited<ReturnType<typeof storage.transactions.findById>>
        >,
      );

      await storage.transactionAttempts.update(attempt.id, {
        status: 'completed',
        callback_received_at: new Date('2024-06-01T10:00:00.000Z').toISOString(),
      });

      const kept = await storage.transactionAttempts.update(attempt.id, { status: 'completed' });

      expect(kept.callback_received_at).not.toBeNull();
    });
  });
}
