import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SispStorage } from '../../src/core/contracts/storage';

export function runStorageContract(makeStorage: () => Promise<SispStorage>): void {
  let storage: SispStorage;

  beforeEach(async () => {
    storage = await makeStorage();
  });

  afterEach(async () => {
    await storage.destroy();
  });

  describe('transactions.create / findById', () => {
    it('persists and retrieves a transaction by id', async () => {
      const created = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-001',
        merchantSession: 'SES-CONTRACT-001',
        amount: 2500,
      });

      expect(created.id).toBeTypeOf('number');
      expect(created.merchant_ref).toBe('REF-CONTRACT-001');
      expect(created.merchant_session).toBe('SES-CONTRACT-001');
      expect(created.amount).toBe(2500);
      expect(created.status).toBe('pending');

      const found = await storage.transactions.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.merchant_ref).toBe('REF-CONTRACT-001');
      expect(found?.status).toBe('pending');
    });

    it('returns null for a missing id', async () => {
      const found = await storage.transactions.findById(999_999_999);

      expect(found).toBeNull();
    });
  });

  describe('transaction() unit-of-work rollback', () => {
    it('rolls back changes when the callback throws', async () => {
      const tx = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-ROLLBACK',
        merchantSession: 'SES-CONTRACT-ROLLBACK',
        amount: 1000,
      });

      await expect(
        storage.transaction(async (unit) => {
          await unit.transactions.update(tx.id, { status: 'completed' });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const after = await storage.transactions.findById(tx.id);

      expect(after?.status).toBe('pending');
    });
  });

  describe('transactions.list', () => {
    it('bounds result count and returns newest first', async () => {
      for (let i = 0; i < 5; i += 1) {
        await storage.transactions.create({
          merchantRef: `REF-LIST-${i}`,
          merchantSession: `SES-LIST-${i}`,
          amount: 100 * (i + 1),
        });
      }

      const rows = await storage.transactions.list({ limit: 3 });

      expect(rows.length).toBeLessThanOrEqual(3);
      expect(rows[0]?.merchant_ref).toBe('REF-LIST-4');
      expect(rows[1]?.merchant_ref).toBe('REF-LIST-3');
      expect(rows[2]?.merchant_ref).toBe('REF-LIST-2');
    });
  });

  describe('transactions.findByIdForUpdate', () => {
    it('returns the row when it exists', async () => {
      const created = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-LOCK',
        merchantSession: 'SES-CONTRACT-LOCK',
        amount: 750,
      });

      const row = await storage.transactions.findByIdForUpdate(created.id);

      expect(row).not.toBeNull();
      expect(row?.id).toBe(created.id);
      expect(row?.status).toBe('pending');
    });

    it('returns null for a missing id', async () => {
      const row = await storage.transactions.findByIdForUpdate(999_999_999);

      expect(row).toBeNull();
    });
  });
}
