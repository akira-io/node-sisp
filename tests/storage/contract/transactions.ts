import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { GetContractSubject } from './types';

export function runTransactionsContract(getSubject: GetContractSubject): void {
  describe('transactions.create / findById', () => {
    it('persists and retrieves a transaction by id', async () => {
      const { storage } = getSubject();
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
      const { storage } = getSubject();
      const found = await storage.transactions.findById(999_999_999);

      expect(found).toBeNull();
    });
  });

  describe('transaction() unit-of-work rollback', () => {
    it('rolls back changes when the callback throws', async () => {
      const { storage } = getSubject();
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
      const { storage } = getSubject();
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
      const { storage } = getSubject();
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
      const { storage } = getSubject();
      const row = await storage.transactions.findByIdForUpdate(999_999_999);

      expect(row).toBeNull();
    });
  });

  describe('encrypted columns and posId', () => {
    it('stores posId and round-trips encrypted request metadata', async () => {
      const { storage } = getSubject();
      const created = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-POS',
        merchantSession: 'SES-CONTRACT-POS',
        posId: '90051',
        amount: 1200,
      });

      expect((await storage.transactions.findById(created.id))?.pos_id).toBe('90051');

      await storage.requestMetadata.create({
        transaction_id: created.id,
        ip_address: '203.0.113.7',
        custom_metadata: { payload: { amount: 1200 }, headers: { host: 'shop.test' } },
      });

      const [metadata] = await storage.requestMetadata.listByTransaction(created.id);

      expect(metadata?.ip_address).toBe('203.0.113.7');
      expect(metadata?.custom_metadata).toEqual({
        payload: { amount: 1200 },
        headers: { host: 'shop.test' },
      });
    });

    it('logs payload changes and reads them back decrypted', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const created = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-LOG',
        merchantSession: 'SES-CONTRACT-LOG',
        amount: 900,
        payload: { posID: '90051' },
      });

      await storage.transactions.update(created.id, { payload: { posID: '90051', refunds: [1] } });

      const [entry] = await storage.transactionLogs.listByTransaction(created.id);

      expect(entry?.changed_attributes).toEqual(['payload']);
      expect(
        await subject.storedJsonType(
          DEFAULT_TABLES.transactionLogs,
          'changed_attributes',
          entry?.id ?? 0,
        ),
      ).toBe('array');
      expect(
        await subject.storedJsonType(DEFAULT_TABLES.transactionLogs, 'new_values', entry?.id ?? 0),
      ).toBe('object');
      expect(entry?.old_values).toMatchObject({ payload: { posID: '90051' } });
      expect(entry?.new_values).toMatchObject({ payload: { posID: '90051', refunds: [1] } });
    });
  });
}
