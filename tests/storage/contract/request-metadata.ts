import { describe, expect, it } from 'vitest';
import type { SispStorage } from '../../../src/core/contracts/storage';
import type { GetContractSubject } from './types';

async function seed(storage: SispStorage, transactionId: number, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await storage.requestMetadata.create({
      transaction_id: transactionId,
      ip_address: `203.0.113.${index + 1}`,
    });
  }
}

export function runRequestMetadataContract(getSubject: GetContractSubject): void {
  describe('requestMetadata.purgeOlderThan', () => {
    it('deletes nothing when every row is inside the window', async () => {
      const { storage } = getSubject();
      const transaction = await storage.transactions.create({
        merchantRef: 'REF-PURGE-001',
        merchantSession: 'SES-PURGE-001',
        amount: 100,
      });

      await seed(storage, transaction.id, 3);

      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const deleted = await storage.requestMetadata.purgeOlderThan(cutoff, 100);

      expect(deleted).toBe(0);
      expect(await storage.requestMetadata.listByTransaction(transaction.id)).toHaveLength(3);
    });

    it('deletes the rows written before the cutoff', async () => {
      const { storage } = getSubject();
      const transaction = await storage.transactions.create({
        merchantRef: 'REF-PURGE-002',
        merchantSession: 'SES-PURGE-002',
        amount: 100,
      });

      await seed(storage, transaction.id, 3);

      const cutoff = new Date(Date.now() + 60_000).toISOString();
      const deleted = await storage.requestMetadata.purgeOlderThan(cutoff, 100);

      expect(deleted).toBe(3);
      expect(await storage.requestMetadata.listByTransaction(transaction.id)).toHaveLength(0);
    });

    it('never deletes more than the batch size', async () => {
      const { storage } = getSubject();
      const transaction = await storage.transactions.create({
        merchantRef: 'REF-PURGE-003',
        merchantSession: 'SES-PURGE-003',
        amount: 100,
      });

      await seed(storage, transaction.id, 5);

      const cutoff = new Date(Date.now() + 60_000).toISOString();

      expect(await storage.requestMetadata.purgeOlderThan(cutoff, 2)).toBe(2);
      expect(await storage.requestMetadata.purgeOlderThan(cutoff, 2)).toBe(2);
      expect(await storage.requestMetadata.purgeOlderThan(cutoff, 2)).toBe(1);
      expect(await storage.requestMetadata.purgeOlderThan(cutoff, 2)).toBe(0);
    });
  });

  describe('requestMetadata.countOlderThan', () => {
    it('counts the rows past the cutoff', async () => {
      const { storage } = getSubject();
      const transaction = await storage.transactions.create({
        merchantRef: 'REF-COUNT-001',
        merchantSession: 'SES-COUNT-001',
        amount: 100,
      });

      await seed(storage, transaction.id, 4);

      const cutoff = new Date(Date.now() + 60_000).toISOString();

      expect(await storage.requestMetadata.countOlderThan(cutoff)).toBe(4);
    });

    it('counts zero when nothing is past the cutoff', async () => {
      const { storage } = getSubject();
      const transaction = await storage.transactions.create({
        merchantRef: 'REF-COUNT-002',
        merchantSession: 'SES-COUNT-002',
        amount: 100,
      });

      await seed(storage, transaction.id, 3);

      const cutoff = new Date(Date.now() - 60_000).toISOString();

      expect(await storage.requestMetadata.countOlderThan(cutoff)).toBe(0);
    });

    it('matches what a subsequent purge actually deletes', async () => {
      const { storage } = getSubject();
      const transaction = await storage.transactions.create({
        merchantRef: 'REF-COUNT-003',
        merchantSession: 'SES-COUNT-003',
        amount: 100,
      });

      await seed(storage, transaction.id, 5);

      const cutoff = new Date(Date.now() + 60_000).toISOString();
      const counted = await storage.requestMetadata.countOlderThan(cutoff);
      const deleted = await storage.requestMetadata.purgeOlderThan(cutoff, 100);

      expect(counted).toBe(deleted);
    });
  });
}
