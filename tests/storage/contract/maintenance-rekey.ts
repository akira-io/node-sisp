import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { SispStorage } from '../../../src/core/contracts/storage';
import { CONTRACT_APP_KEY, type GetContractSubject } from './types';

const ROTATION_KEY = 'contract-rotation-key';
const UNREADABLE = /no configured key matches the key id/;

async function rotated(subject: ReturnType<GetContractSubject>): Promise<SispStorage> {
  return subject.withKeys({ current: ROTATION_KEY, previous: [CONTRACT_APP_KEY] });
}

function first<T>(rows: readonly T[]): T {
  const row = rows[0];

  if (row === undefined) {
    throw new Error('The contract expected at least one row.');
  }

  return row;
}

async function seedTransaction(storage: SispStorage, tag: string) {
  return storage.transactions.create({
    merchantRef: `REF-${tag}`,
    merchantSession: `SES-${tag}`,
    amount: 100,
    payload: { posID: '90051' },
  });
}

export function runMaintenanceRekeyContract(getSubject: GetContractSubject): void {
  describe('maintenance.reencryptBatch onto a new key', () => {
    it('rewrites a plain ciphertext column', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const transaction = await seedTransaction(storage, 'REKEY-PAYLOAD');
      const rotate = await rotated(subject);

      const result = await rotate.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: transaction.id - 1,
        limit: 1,
      });

      expect(result.rewritten).toBe(1);
      expect(result.vanished).toBe(0);
      expect(result.unreadableValues).toEqual([]);

      const found = await rotate.transactions.findById(transaction.id);

      expect(found?.payload).toEqual({ posID: '90051' });
      await expect(storage.transactions.findById(transaction.id)).rejects.toThrow(UNREADABLE);
    });

    it('rewrites the request metadata custom_metadata column', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const transaction = await seedTransaction(storage, 'REKEY-METADATA');

      await storage.requestMetadata.create({
        transaction_id: transaction.id,
        ip_address: '203.0.113.44',
        custom_metadata: { source: 'contract' },
      });

      const before = first(await storage.requestMetadata.listByTransaction(transaction.id));
      const rotate = await rotated(subject);

      const result = await rotate.maintenance.reencryptBatch({
        table: 'requestMetadata',
        columns: [{ name: 'custom_metadata' }],
        afterId: before.id - 1,
        limit: 1,
      });

      expect(result.rewritten).toBe(1);
      expect(result.unreadableValues).toEqual([]);

      const after = first(await rotate.requestMetadata.listByTransaction(transaction.id));

      expect(after.custom_metadata).toEqual({ source: 'contract' });
      await expect(storage.requestMetadata.listByTransaction(transaction.id)).rejects.toThrow(
        UNREADABLE,
      );
    });

    it('rewrites the payload nested in the transaction log values', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const transaction = await seedTransaction(storage, 'REKEY-LOGS');

      await storage.transactions.update(transaction.id, { payload: { posID: '90052' } });

      const before = first(await storage.transactionLogs.listByTransaction(transaction.id));
      const rotate = await rotated(subject);

      const result = await rotate.maintenance.reencryptBatch({
        table: 'transactionLogs',
        columns: [
          { name: 'old_values', nestedProperty: 'payload' },
          { name: 'new_values', nestedProperty: 'payload' },
        ],
        afterId: before.id - 1,
        limit: 1,
      });

      expect(result.rewritten).toBe(1);
      expect(result.unreadableValues).toEqual([]);

      const after = first(await rotate.transactionLogs.listByTransaction(transaction.id));

      expect(after.old_values?.payload).toEqual({ posID: '90051' });
      expect(after.new_values?.payload).toEqual({ posID: '90052' });
      await expect(storage.transactionLogs.listByTransaction(transaction.id)).rejects.toThrow(
        UNREADABLE,
      );
    });

    it('reports an unreadable row and keeps walking past it', async () => {
      const subject = getSubject();
      const stray = await subject.withKeys({ current: 'contract-stray-key' });
      const orphan = await seedTransaction(stray, 'REKEY-ORPHAN');
      const next = await seedTransaction(subject.storage, 'REKEY-AFTER-ORPHAN');
      const rotate = await rotated(subject);

      const result = await rotate.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: orphan.id - 1,
        limit: 2,
      });

      expect(result).toMatchObject({
        processed: 2,
        rewritten: 1,
        current: 0,
        plaintext: 0,
        unreadable: 1,
        vanished: 0,
      });
      expect(result.lastId).toBe(next.id);
      expect(result.unreadableValues).toHaveLength(1);
      expect(result.unreadableValues[0]?.id).toBe(orphan.id);
      expect(result.unreadableValues[0]?.column).toBe('payload');
      expect(result.unreadableValues[0]?.reason).toMatch(/no configured key/);
    });

    it('counts a row that was never encrypted as plaintext, not as current', async () => {
      const subject = getSubject();
      const transaction = await seedTransaction(subject.storage, 'REKEY-PLAINTEXT');

      await subject.overwrite(
        DEFAULT_TABLES.transactions,
        'payload',
        transaction.id,
        '{"posID":"90051"}',
      );

      const rotate = await rotated(subject);

      const result = await rotate.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: transaction.id - 1,
        limit: 1,
      });

      expect(result).toMatchObject({
        processed: 1,
        rewritten: 0,
        current: 0,
        plaintext: 1,
        unreadable: 0,
        vanished: 0,
      });
      expect(result.unreadableValues).toEqual([]);
    });

    it('rewrites both encrypted columns of an attempt', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const transaction = await seedTransaction(storage, 'REKEY-ATTEMPT');
      const record = await storage.transactions.findById(transaction.id);
      const attempt = await storage.transactionAttempts.createFromTransaction(
        record as NonNullable<typeof record>,
      );

      await storage.transactionAttempts.update(attempt.id, {
        status: 'completed',
        callback_payload: { code: '00' },
      });

      const rotate = await rotated(subject);

      const result = await rotate.maintenance.reencryptBatch({
        table: 'transactionAttempts',
        columns: [{ name: 'payload' }, { name: 'callback_payload' }],
        afterId: attempt.id - 1,
        limit: 1,
      });

      expect(result.rewritten).toBe(1);
      expect(result.unreadableValues).toEqual([]);

      const after = first(await rotate.transactionAttempts.listByTransaction(transaction.id));

      expect(after.payload).toEqual({ posID: '90051' });
      expect(after.callback_payload).toEqual({ code: '00' });
      await expect(storage.transactionAttempts.listByTransaction(transaction.id)).rejects.toThrow(
        UNREADABLE,
      );
    });
  });
}
