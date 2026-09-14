import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { createSisp } from '../../src/application/create-sisp';

const dir = mkdtempSync(join(tmpdir(), 'sisp-rotate-report-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seeded(filename: string, appKey: string, rows: number) {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'code',
    appKey,
    allowWeakAppKey: true,
    database: {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    },
  });

  try {
    for (let index = 0; index < rows; index += 1) {
      await sisp.models.transactions.create({
        merchantRef: `REF-REPORT-${index}`,
        merchantSession: `SES-REPORT-${index}`,
        amount: 1000,
        payload: { posID: '90051' },
      });
    }
  } finally {
    await sisp.destroy();
  }
}

async function rotating(filename: string, appKey: string, previousAppKeys: string[] = []) {
  return createSisp({
    posId: '90051',
    posAutCode: 'code',
    appKey,
    previousAppKeys,
    allowWeakAppKey: true,
    database: {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    },
  });
}

describe('rotateEncryptionKey batch validation', () => {
  it.each([
    ['a fractional batch', 2.5],
    ['a zero batch', 0],
  ])('rejects %s instead of rotating part of the table', async (label, batch) => {
    const filename = join(dir, `${label.replace(/\s+/g, '-')}.db`);

    await seeded(filename, 'old-key', 5);

    const sisp = await rotating(filename, 'new-key', ['old-key']);

    try {
      await expect(sisp.rotateEncryptionKey({ batch })).rejects.toThrow(
        /batch to be an integer between 1 and 999/,
      );

      const complete = await sisp.rotateEncryptionKey();

      expect(complete.rewritten).toBe(5);
    } finally {
      await sisp.destroy();
    }
  });
});

function writePlaintextPayloads(filename: string): void {
  const writer = new Database(filename);

  try {
    writer
      .prepare(`update ${DEFAULT_TABLES.transactions} set payload = ?`)
      .run('{"posID":"90051"}');
  } finally {
    writer.close();
  }
}

describe('rotateEncryptionKey plaintext rows', () => {
  it('counts rows that were never encrypted without failing the run', async () => {
    const filename = join(dir, 'plaintext.db');

    await seeded(filename, 'old-key', 2);
    writePlaintextPayloads(filename);

    const sisp = await rotating(filename, 'new-key', ['old-key']);

    try {
      const result = await sisp.rotateEncryptionKey({ batch: 10 });

      expect(result).toMatchObject({
        processed: 2,
        rewritten: 0,
        current: 0,
        plaintext: 2,
        unreadable: 0,
        vanished: 0,
      });
      expect(result.unreadableValues).toEqual([]);
    } finally {
      await sisp.destroy();
    }
  });
});
