import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';

const dir = mkdtempSync(join(tmpdir(), 'sisp-drizzle-migrate-'));

function storageOver(filename: string, autoMigrate: boolean) {
  return createDrizzleStorage(drizzle(new Database(filename)), DEFAULT_TABLES, 'app-key', {
    dialect: 'sqlite',
    autoMigrate,
  });
}

describe('migrate()', () => {
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a table that predates a column the adapter writes', async () => {
    const filename = join(dir, `${process.hrtime.bigint()}.db`);
    const seed = new Database(filename);

    seed.exec(
      `CREATE TABLE "${DEFAULT_TABLES.transactions}" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "merchant_ref" varchar(255) NOT NULL,
        "merchant_session" varchar(255) NOT NULL
      )`,
    );
    seed.close();

    await expect(storageOver(filename, true).migrate?.()).rejects.toThrow(
      'does not carry every column this adapter writes',
    );
  });

  it('accepts a database it created itself and is safe to repeat', async () => {
    const filename = join(dir, `${process.hrtime.bigint()}.db`);
    const storage = storageOver(filename, true);

    await storage.migrate?.();

    await expect(storage.migrate?.()).resolves.not.toThrow();
  });

  it('does nothing when autoMigrate is off', async () => {
    const filename = join(dir, `${process.hrtime.bigint()}.db`);

    await storageOver(filename, false).migrate?.();

    const probe = new Database(filename, { readonly: true });

    try {
      const row = probe
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(DEFAULT_TABLES.transactions);

      expect(row).toBeUndefined();
    } finally {
      probe.close();
    }
  });
});
