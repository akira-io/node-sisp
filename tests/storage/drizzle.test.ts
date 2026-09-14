import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, describe } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { createDrizzleStorage } from '../../src/infrastructure/storage/drizzle';
import { runStorageContract } from './contract';
import { CONTRACT_APP_KEY } from './contract/types';
import { sqliteStoredJsonType } from './json-type';

const dir = mkdtempSync(join(tmpdir(), 'sisp-drizzle-contract-'));

describe('DrizzleStorage (sqlite)', () => {
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  runStorageContract(async () => {
    const filename = join(dir, `${process.hrtime.bigint()}.db`);
    const storage = createDrizzleStorage(
      drizzle(new Database(filename)),
      DEFAULT_TABLES,
      CONTRACT_APP_KEY,
      {
        dialect: 'sqlite',
        autoMigrate: true,
      },
    );

    await storage.migrate?.();

    return {
      storage,
      async withKeys(keys) {
        return createDrizzleStorage(drizzle(new Database(filename)), DEFAULT_TABLES, keys, {
          dialect: 'sqlite',
        });
      },
      async overwrite(table, column, id, value) {
        const writer = new Database(filename);

        try {
          writer.prepare(`update ${table} set ${column} = ? where id = ?`).run(value, id);
        } finally {
          writer.close();
        }
      },
      async storedJsonType(table, column, id) {
        const probe = new Database(filename, { readonly: true });

        try {
          return sqliteStoredJsonType(
            (sql, ...values) => probe.prepare(sql).get(...values) as Record<string, unknown>,
            table,
            column,
            id,
          );
        } finally {
          probe.close();
        }
      },
    };
  });
});
