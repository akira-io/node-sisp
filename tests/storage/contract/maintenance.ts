import { describe, expect, it } from 'vitest';
import { runMaintenanceRekeyContract } from './maintenance-rekey';
import type { GetContractSubject } from './types';

export function runMaintenanceContract(getSubject: GetContractSubject): void {
  runMaintenanceRekeyContract(getSubject);

  describe('maintenance.reencryptBatch', () => {
    it('reports nothing to do on an empty table', async () => {
      const { storage } = getSubject();

      const result = await storage.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: 0,
        limit: 10,
      });

      expect(result.processed).toBe(0);
      expect(result.rewritten).toBe(0);
      expect(result.lastId).toBeNull();
    });

    it('walks rows in id order and reports the last id it saw', async () => {
      const { storage } = getSubject();

      const first = await storage.transactions.create({
        merchantRef: 'REF-REKEY-001',
        merchantSession: 'SES-REKEY-001',
        amount: 100,
        payload: { posID: '90051' },
      });
      const second = await storage.transactions.create({
        merchantRef: 'REF-REKEY-002',
        merchantSession: 'SES-REKEY-002',
        amount: 100,
        payload: { posID: '90052' },
      });

      const batch = await storage.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: 0,
        limit: 1,
      });

      expect(batch.processed).toBe(1);
      expect(batch.lastId).toBe(first.id);

      const next = await storage.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: first.id,
        limit: 1,
      });

      expect(next.lastId).toBe(second.id);
    });

    it('rewrites nothing when every row is already on the current key', async () => {
      const { storage } = getSubject();

      const transaction = await storage.transactions.create({
        merchantRef: 'REF-REKEY-003',
        merchantSession: 'SES-REKEY-003',
        amount: 100,
        payload: { posID: '90051' },
      });

      const result = await storage.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: transaction.id - 1,
        limit: 1,
      });

      expect(result.processed).toBe(1);
      expect(result.rewritten).toBe(0);

      const found = await storage.transactions.findById(transaction.id);

      expect(found?.payload).toEqual({ posID: '90051' });
    });

    it('leaves the payload readable after a pass', async () => {
      const { storage } = getSubject();

      const transaction = await storage.transactions.create({
        merchantRef: 'REF-REKEY-004',
        merchantSession: 'SES-REKEY-004',
        amount: 100,
        payload: { posID: '90051' },
      });

      await storage.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: transaction.id - 1,
        limit: 1,
      });

      const found = await storage.transactions.findById(transaction.id);

      expect(found?.payload).toEqual({ posID: '90051' });
    });
  });
}
