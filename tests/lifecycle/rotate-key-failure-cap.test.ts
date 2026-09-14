import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';

const dir = mkdtempSync(join(tmpdir(), 'sisp-failure-cap-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function databaseFor(filename: string) {
  return {
    client: 'better-sqlite3' as const,
    connection: { filename },
    autoMigrate: true,
  };
}

async function seed(filename: string, transactions: number, metadataRows: number): Promise<void> {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'code',
    appKey: 'old-key',
    allowWeakAppKey: true,
    database: databaseFor(filename),
  });

  try {
    for (let index = 0; index < transactions; index += 1) {
      await sisp.models.transactions.create({
        merchantRef: `REF-CAP-${index}`,
        merchantSession: `SES-CAP-${index}`,
        amount: 1000,
        payload: { posID: '90051' },
      });
    }

    for (let index = 0; index < metadataRows; index += 1) {
      await sisp.storage.requestMetadata.create({
        ip_address: '203.0.113.8',
        custom_metadata: { index },
      });
    }
  } finally {
    await sisp.destroy();
  }
}

async function seedMetadataUnder(filename: string, appKey: string, rows: number): Promise<void> {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'code',
    appKey,
    allowWeakAppKey: true,
    database: databaseFor(filename),
  });

  try {
    for (let index = 0; index < rows; index += 1) {
      await sisp.storage.requestMetadata.create({
        ip_address: '203.0.113.8',
        custom_metadata: { index },
      });
    }
  } finally {
    await sisp.destroy();
  }
}

async function rotateWith(filename: string, appKey: string) {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'code',
    appKey,
    allowWeakAppKey: true,
    database: databaseFor(filename),
  });

  try {
    return await sisp.rotateEncryptionKey();
  } finally {
    await sisp.destroy();
  }
}

async function rotateWithTheWrongKey(filename: string) {
  return rotateWith(filename, 'wrong-key');
}

describe('rotateEncryptionKey against a misconfigured key', () => {
  it('reports every failure in the total but collects only a sample', async () => {
    const filename = join(dir, 'sample.db');

    await seed(filename, 60, 0);

    const result = await rotateWithTheWrongKey(filename);

    expect(result.unreadableValueCount).toBe(60);
    expect(result.unreadableValues).toHaveLength(50);
    expect(result.stoppedEarly).toBe(false);
    expect(result.stoppedAtTable).toBeNull();
  }, 60_000);

  it('stops before walking every table once nothing has been readable', async () => {
    const filename = join(dir, 'early-stop.db');

    await seed(filename, 600, 5);

    const result = await rotateWithTheWrongKey(filename);

    expect(result.stoppedEarly).toBe(true);
    expect(result.stoppedAtTable).toBe('transactions');
    expect(result.processed).toBe(600);
    expect(result.unreadableValues).toHaveLength(50);
    expect(result.unreadableValueCount).toBe(600);
  }, 120_000);

  it('stops on a hopeless table even when an earlier table was readable', async () => {
    const filename = join(dir, 'per-table-stop.db');

    await seed(filename, 1, 0);
    await seedMetadataUnder(filename, 'other-key', 600);

    const result = await rotateWith(filename, 'old-key');

    expect(result.current).toBeGreaterThan(0);
    expect(result.stoppedEarly).toBe(true);
    expect(result.stoppedAtTable).toBe('requestMetadata');
    expect(result.unreadableValueCount).toBe(600);
  }, 120_000);
});
