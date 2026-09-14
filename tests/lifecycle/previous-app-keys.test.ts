import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';

const dir = mkdtempSync(join(tmpdir(), 'sisp-previous-keys-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('previousAppKeys', () => {
  it('reads a payload written by the previous key', async () => {
    const filename = join(dir, 'rotation.db');
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };
    const base = {
      posId: '90051',
      posAutCode: 'code',
      database,
      allowWeakAppKey: true,
    };

    const before = await createSisp({ ...base, appKey: 'old-key' });
    let id = 0;

    try {
      const transaction = await before.models.transactions.create({
        merchantRef: 'REF-ROTATE-001',
        merchantSession: 'SES-ROTATE-001',
        amount: 1000,
        payload: { posID: '90051' },
      });

      id = transaction.id;
    } finally {
      await before.destroy();
    }

    const after = await createSisp({
      ...base,
      appKey: 'new-key',
      previousAppKeys: ['old-key'],
    });

    try {
      const found = await after.models.transactions.findById(id);

      expect(found?.payload).toEqual({ posID: '90051' });
    } finally {
      await after.destroy();
    }
  });
});
