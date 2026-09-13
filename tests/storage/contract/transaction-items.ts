import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { GetContractSubject } from './types';

export function runTransactionItemsContract(getSubject: GetContractSubject): void {
  describe('transactionItems.metadata', () => {
    it('stores metadata as a JSON object, not as an encoded string', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const tx = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-ITEM',
        merchantSession: 'SES-CONTRACT-ITEM',
        amount: 4200,
      });

      await storage.transactionItems.createMany(tx.id, [
        {
          productName: 'Ticket',
          quantity: 1,
          unitPrice: 42,
          totalPrice: 42,
          metadata: { seat: '12A', tags: ['vip'] },
        },
      ]);

      const [item] = await storage.transactionItems.listByTransaction(tx.id);

      expect(item?.metadata).toEqual({ seat: '12A', tags: ['vip'] });
      expect(
        await subject.storedJsonType(DEFAULT_TABLES.transactionItems, 'metadata', item?.id ?? 0),
      ).toBe('object');
    });

    it('stores a missing metadata as SQL NULL, not as the JSON null document', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const tx = await storage.transactions.create({
        merchantRef: 'REF-CONTRACT-ITEM-NULL',
        merchantSession: 'SES-CONTRACT-ITEM-NULL',
        amount: 100,
      });

      await storage.transactionItems.createMany(tx.id, [
        { productName: 'Ticket', quantity: 1, unitPrice: 1, totalPrice: 1 },
        {
          productName: 'Programme',
          quantity: 1,
          unitPrice: 1,
          totalPrice: 1,
          metadata: { printed: true },
        },
      ]);

      const [item] = await storage.transactionItems.listByTransaction(tx.id);

      expect(item?.metadata).toBeNull();
      expect(
        await subject.storedJsonType(DEFAULT_TABLES.transactionItems, 'metadata', item?.id ?? 0),
      ).toBe('sql-null');

      const [, withMetadata] = await storage.transactionItems.listByTransaction(tx.id);

      expect(withMetadata?.metadata).toEqual({ printed: true });
      expect(
        await subject.storedJsonType(
          DEFAULT_TABLES.transactionItems,
          'metadata',
          withMetadata?.id ?? 0,
        ),
      ).toBe('object');
    });
  });
}
