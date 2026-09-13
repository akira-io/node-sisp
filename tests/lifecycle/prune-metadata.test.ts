import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';

const config = {
  posId: '90051',
  posAutCode: 'code',
  sandbox: true,
  appKey: 'app-key',
  database: {
    client: 'better-sqlite3' as const,
    connection: { filename: ':memory:' },
    autoMigrate: true,
  },
};

describe('Sisp.pruneRequestMetadata', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes rows older than the requested window and reports the count', async () => {
    const sisp = await createSisp(config);

    try {
      const transaction = await sisp.models.transactions.create({
        merchantRef: 'REF-PRUNE-001',
        merchantSession: 'SES-PRUNE-001',
        amount: 1000,
      });

      await sisp.storage.requestMetadata.create({
        transaction_id: transaction.id,
        ip_address: '203.0.113.1',
      });

      const untouched = await sisp.pruneRequestMetadata({ olderThanDays: 30 });

      expect(untouched.deleted).toBe(0);

      vi.useFakeTimers();
      vi.advanceTimersByTime(1);

      const purged = await sisp.pruneRequestMetadata({ olderThanDays: 0 });

      vi.useRealTimers();

      expect(purged.deleted).toBe(1);
      expect(await sisp.storage.requestMetadata.listByTransaction(transaction.id)).toHaveLength(0);
    } finally {
      await sisp.destroy();
    }
  });

  it('rejects a batch below 1', async () => {
    const sisp = await createSisp(config);

    try {
      await expect(sisp.pruneRequestMetadata({ olderThanDays: 1, batch: 0 })).rejects.toThrow(
        'needs a batch of at least 1',
      );
    } finally {
      await sisp.destroy();
    }
  });

  it('refuses to run without a retention window', async () => {
    const sisp = await createSisp(config);

    try {
      await expect(sisp.pruneRequestMetadata()).rejects.toThrow(
        'Request metadata pruning needs a retention window',
      );
    } finally {
      await sisp.destroy();
    }
  });

  it('uses security.metadataRetentionDays when no window is passed', async () => {
    const sisp = await createSisp({
      ...config,
      security: { metadataRetentionDays: 0 },
    });

    try {
      const transaction = await sisp.models.transactions.create({
        merchantRef: 'REF-PRUNE-002',
        merchantSession: 'SES-PRUNE-002',
        amount: 1000,
      });

      await sisp.storage.requestMetadata.create({
        transaction_id: transaction.id,
        ip_address: '203.0.113.2',
      });

      vi.useFakeTimers();
      vi.advanceTimersByTime(1);

      const result = await sisp.pruneRequestMetadata();

      vi.useRealTimers();

      expect(result.deleted).toBe(1);
    } finally {
      await sisp.destroy();
    }
  });
});
