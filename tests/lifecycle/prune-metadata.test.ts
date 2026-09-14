import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import { SispError } from '../../src/domain/errors/exceptions';

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
        'pruneRequestMetadata expects batch to be an integer between 1 and 999',
      );
    } finally {
      await sisp.destroy();
    }
  });

  it('refuses a negative retention window instead of deleting everything', async () => {
    const sisp = await createSisp(config);

    try {
      const transaction = await sisp.models.transactions.create({
        merchantRef: 'REF-PRUNE-003',
        merchantSession: 'SES-PRUNE-003',
        amount: 1000,
      });

      await sisp.storage.requestMetadata.create({
        transaction_id: transaction.id,
        ip_address: '203.0.113.3',
      });

      await expect(sisp.pruneRequestMetadata({ olderThanDays: -1 })).rejects.toThrow(
        'olderThanDays to be a non-negative integer',
      );
      expect(await sisp.storage.requestMetadata.listByTransaction(transaction.id)).toHaveLength(1);
    } finally {
      await sisp.destroy();
    }
  });

  it.each([
    ['not a number', Number.NaN],
    ['fractional', 1.5],
    ['negative', -1],
  ])('refuses a retention window that is %s when counting', async (_label, olderThanDays) => {
    const sisp = await createSisp(config);

    try {
      await expect(sisp.countPrunableRequestMetadata({ olderThanDays })).rejects.toThrow(SispError);
    } finally {
      await sisp.destroy();
    }
  });

  it('refuses a negative security.metadataRetentionDays from the configuration file', async () => {
    const sisp = await createSisp({ ...config, security: { metadataRetentionDays: -1 } });

    try {
      await expect(sisp.pruneRequestMetadata()).rejects.toThrow(
        'olderThanDays to be a non-negative integer',
      );
    } finally {
      await sisp.destroy();
    }
  });

  it('refuses a fractional batch with the same error the rotation raises', async () => {
    const sisp = await createSisp(config);

    try {
      await expect(sisp.pruneRequestMetadata({ olderThanDays: 1, batch: 1.5 })).rejects.toThrow(
        SispError,
      );
    } finally {
      await sisp.destroy();
    }
  });

  it('refuses a batch beyond the bound every dialect can bind', async () => {
    const sisp = await createSisp(config);

    try {
      await expect(sisp.pruneRequestMetadata({ olderThanDays: 1, batch: 100_000 })).rejects.toThrow(
        'between 1 and 999',
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

  it('drains every batch and reports the whole count, not the first batch', async () => {
    const sisp = await createSisp(config);

    try {
      const transaction = await sisp.models.transactions.create({
        merchantRef: 'REF-PRUNE-DRAIN',
        merchantSession: 'SES-PRUNE-DRAIN',
        amount: 1000,
      });

      for (let index = 0; index < 5; index += 1) {
        await sisp.storage.requestMetadata.create({
          transaction_id: transaction.id,
          ip_address: `203.0.113.${index + 10}`,
        });
      }

      vi.useFakeTimers();
      vi.advanceTimersByTime(1);

      const purged = await sisp.pruneRequestMetadata({ olderThanDays: 0, batch: 2 });

      vi.useRealTimers();

      expect(purged.deleted).toBe(5);
      expect(await sisp.storage.requestMetadata.listByTransaction(transaction.id)).toHaveLength(0);
    } finally {
      await sisp.destroy();
    }
  });
});
