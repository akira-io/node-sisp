import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import type { SispStorage } from '../../src/core/contracts/storage';

export type StoredJsonType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'boolean'
  | 'json-null'
  | 'sql-null';

export interface ContractSubject {
  storage: SispStorage;
  storedJsonType(table: string, column: string, id: number): Promise<StoredJsonType>;
}

export function runStorageContract(makeSubject: () => Promise<ContractSubject>): void {
  let subject: ContractSubject;
  let storage: SispStorage;

  beforeEach(async () => {
    subject = await makeSubject();
    storage = subject.storage;
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

  describe('paymentIntents.reserve / findByKey', () => {
    it('reserves a key once and stores the request hash', async () => {
      expect(await storage.paymentIntents.reserve('KEY-CONTRACT-1', 'hash-a')).toBe(true);
      expect(await storage.paymentIntents.reserve('KEY-CONTRACT-1', 'hash-b')).toBe(false);

      const intent = await storage.paymentIntents.findByKey('KEY-CONTRACT-1');

      expect(intent?.status).toBe('processing');
      expect(intent?.request_hash).toBe('hash-a');
      expect(intent?.transaction_id).toBeNull();
    });

    it('reclaims a failed key without a transaction and refreshes the request hash', async () => {
      await storage.paymentIntents.reserve('KEY-CONTRACT-2', 'hash-a');
      await storage.paymentIntents.fail('KEY-CONTRACT-2', 'boom');

      expect(await storage.paymentIntents.reserve('KEY-CONTRACT-2', 'hash-b')).toBe(true);
      expect((await storage.paymentIntents.findByKey('KEY-CONTRACT-2'))?.request_hash).toBe(
        'hash-b',
      );
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

  describe('encrypted columns and posId', () => {
    it('stores posId and round-trips encrypted request metadata', async () => {
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

  describe('transactionItems.metadata', () => {
    it('stores metadata as a JSON object, not as an encoded string', async () => {
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

  describe('transactionAttempts.update', () => {
    it('writes an explicit null over a stored callback_received_at', async () => {
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
