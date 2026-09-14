import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { SispStorage } from '../../../src/core/contracts/storage';
import { legacyV1Envelope } from '../../helpers/legacy-envelope';
import { CONTRACT_APP_KEY, type GetContractSubject } from './types';

const ROTATION_KEY = 'contract-legacy-rotation-key';
const UNREADABLE = /no configured key matches the key id/;

function v1Envelope(value: unknown): string {
  return legacyV1Envelope(CONTRACT_APP_KEY, value);
}

async function seedTransaction(storage: SispStorage, tag: string) {
  return storage.transactions.create({
    merchantRef: `REF-${tag}`,
    merchantSession: `SES-${tag}`,
    amount: 100,
    payload: { posID: '90051' },
  });
}

function first<T>(rows: readonly T[]): T {
  const row = rows[0];

  if (row === undefined) {
    throw new Error('The contract expected at least one row.');
  }

  return row;
}

export function runLegacyEnvelopeContract(getSubject: GetContractSubject): void {
  describe('rows left behind by the v1 envelope format', () => {
    it('reads a v1 transaction payload through findById', async () => {
      const subject = getSubject();
      const transaction = await seedTransaction(subject.storage, 'LEGACY-PAYLOAD');

      await subject.overwrite(
        DEFAULT_TABLES.transactions,
        'payload',
        transaction.id,
        v1Envelope({ posID: '90051', legacy: true }),
      );

      const found = await subject.storage.transactions.findById(transaction.id);

      expect(found?.payload).toEqual({ posID: '90051', legacy: true });
    });

    it('reads a v1 payload nested in the transaction log values', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const transaction = await seedTransaction(storage, 'LEGACY-LOGS');

      await storage.transactions.update(transaction.id, { payload: { posID: '90052' } });

      const entry = first(await storage.transactionLogs.listByTransaction(transaction.id));

      await subject.overwrite(
        DEFAULT_TABLES.transactionLogs,
        'old_values',
        entry.id,
        JSON.stringify({ payload: v1Envelope({ posID: '90051' }) }),
      );

      const after = first(await storage.transactionLogs.listByTransaction(transaction.id));

      expect(after.old_values?.payload).toEqual({ posID: '90051' });
    });

    it('reads v1 request metadata through listByTransaction', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const transaction = await seedTransaction(storage, 'LEGACY-METADATA');

      await storage.requestMetadata.create({
        transaction_id: transaction.id,
        ip_address: '203.0.113.60',
        custom_metadata: { source: 'contract' },
      });

      const before = first(await storage.requestMetadata.listByTransaction(transaction.id));

      await subject.overwrite(
        DEFAULT_TABLES.requestMetadata,
        'custom_metadata',
        before.id,
        JSON.stringify(v1Envelope({ source: 'legacy' })),
      );

      const after = first(await storage.requestMetadata.listByTransaction(transaction.id));

      expect(after.custom_metadata).toEqual({ source: 'legacy' });
    });

    it('rotates a v1 payload onto the new key', async () => {
      const subject = getSubject();
      const transaction = await seedTransaction(subject.storage, 'LEGACY-ROTATE');

      await subject.overwrite(
        DEFAULT_TABLES.transactions,
        'payload',
        transaction.id,
        v1Envelope({ posID: '90051' }),
      );

      const rotate = await subject.withKeys({
        current: ROTATION_KEY,
        previous: [CONTRACT_APP_KEY],
      });

      const result = await rotate.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: transaction.id - 1,
        limit: 1,
      });

      expect(result).toMatchObject({ processed: 1, rewritten: 1, current: 0, unreadable: 0 });

      const found = await rotate.transactions.findById(transaction.id);

      expect(found?.payload).toEqual({ posID: '90051' });
      await expect(subject.storage.transactions.findById(transaction.id)).rejects.toThrow(
        UNREADABLE,
      );
    });

    it('upgrades a v1 payload to v2 even when the key never changed', async () => {
      const subject = getSubject();
      const { storage } = subject;
      const transaction = await seedTransaction(storage, 'LEGACY-UPGRADE');

      await subject.overwrite(
        DEFAULT_TABLES.transactions,
        'payload',
        transaction.id,
        v1Envelope({ posID: '90051' }),
      );

      const spec = {
        table: 'transactions' as const,
        columns: [{ name: 'payload' }],
        afterId: transaction.id - 1,
        limit: 1,
      };

      expect(await storage.maintenance.reencryptBatch(spec)).toMatchObject({ rewritten: 1 });
      expect(await storage.maintenance.reencryptBatch(spec)).toMatchObject({
        rewritten: 0,
        current: 1,
      });
    });
  });
}
