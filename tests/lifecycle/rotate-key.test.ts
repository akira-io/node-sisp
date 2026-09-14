import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';

const dir = mkdtempSync(join(tmpdir(), 'sisp-rotate-key-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Sisp.rotateEncryptionKey', () => {
  it('rewrites rows written under a retired key so they read back under the new key alone', async () => {
    const filename = join(dir, 'rotate.db');
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };
    const base = { posId: '90051', posAutCode: 'code', database, allowWeakAppKey: true };

    const before = await createSisp({ ...base, appKey: 'old-key' });
    let id = 0;

    try {
      const transaction = await before.models.transactions.create({
        merchantRef: 'REF-ROTATE-010',
        merchantSession: 'SES-ROTATE-010',
        amount: 1000,
        payload: { posID: '90051' },
      });

      id = transaction.id;

      await before.storage.requestMetadata.create({
        transaction_id: id,
        ip_address: '203.0.113.9',
        custom_metadata: { headers: { referer: 'https://merchant.test' } },
      });
    } finally {
      await before.destroy();
    }

    const rotating = await createSisp({
      ...base,
      appKey: 'new-key',
      previousAppKeys: ['old-key'],
    });

    try {
      const result = await rotating.rotateEncryptionKey({ batch: 10 });

      expect(result.rewritten).toBeGreaterThan(0);
      expect(result.unreadableValues).toEqual([]);
    } finally {
      await rotating.destroy();
    }

    const after = await createSisp({ ...base, appKey: 'new-key' });

    try {
      const found = await after.models.transactions.findById(id);

      expect(found?.payload).toEqual({ posID: '90051' });

      const [metadata] = await after.storage.requestMetadata.listByTransaction(id);

      expect(metadata?.custom_metadata).toEqual({ headers: { referer: 'https://merchant.test' } });
    } finally {
      await after.destroy();
    }
  });

  it('rewrites nothing on a second pass', async () => {
    const filename = join(dir, 'idempotent.db');
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };
    const base = {
      posId: '90051',
      posAutCode: 'code',
      database,
      appKey: 'only-key',
      allowWeakAppKey: true,
    };

    const sisp = await createSisp(base);

    try {
      await sisp.models.transactions.create({
        merchantRef: 'REF-ROTATE-011',
        merchantSession: 'SES-ROTATE-011',
        amount: 1000,
        payload: { posID: '90051' },
      });

      const first = await sisp.rotateEncryptionKey({ batch: 10 });
      const second = await sisp.rotateEncryptionKey({ batch: 10 });

      expect(first.rewritten).toBe(0);
      expect(second.rewritten).toBe(0);
      expect(second.processed).toBeGreaterThan(0);
      expect(second.vanished).toBe(0);
      expect(second.unreadableValues).toEqual([]);
    } finally {
      await sisp.destroy();
    }
  });

  it('terminates over an empty database without rewriting anything', async () => {
    const filename = join(dir, 'empty.db');
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };

    const sisp = await createSisp({
      posId: '90051',
      posAutCode: 'code',
      database,
      appKey: 'only-key',
      allowWeakAppKey: true,
    });

    try {
      const result = await sisp.rotateEncryptionKey({ batch: 10 });

      expect(result.processed).toBe(0);
      expect(result.rewritten).toBe(0);
      expect(result.unreadableValues).toEqual([]);
    } finally {
      await sisp.destroy();
    }
  });

  it('paginates across a full page smaller than the table', async () => {
    const filename = join(dir, 'paginate.db');
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };
    const base = { posId: '90051', posAutCode: 'code', database, allowWeakAppKey: true };

    const before = await createSisp({ ...base, appKey: 'old-key' });

    try {
      for (let index = 0; index < 3; index += 1) {
        await before.models.transactions.create({
          merchantRef: `REF-ROTATE-PAGE-${index}`,
          merchantSession: `SES-ROTATE-PAGE-${index}`,
          amount: 1000,
          payload: { posID: '90051' },
        });
      }
    } finally {
      await before.destroy();
    }

    const rotating = await createSisp({
      ...base,
      appKey: 'new-key',
      previousAppKeys: ['old-key'],
    });

    try {
      const result = await rotating.rotateEncryptionKey({ batch: 1 });

      expect(result.rewritten).toBe(3);
      expect(result.processed).toBe(3);
    } finally {
      await rotating.destroy();
    }
  });
});
