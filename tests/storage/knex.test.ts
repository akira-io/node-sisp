import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';
import { runStorageContract } from './contract';
import { CONTRACT_APP_KEY } from './contract/types';
import { sqliteStoredJsonType } from './json-type';

const dir = mkdtempSync(join(tmpdir(), 'sisp-knex-contract-'));

describe('KnexStorage', () => {
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  runStorageContract(async () => {
    const filename = join(dir, `${process.hrtime.bigint()}.db`);
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };
    const storage = await KnexStorage.create(database, DEFAULT_TABLES, CONTRACT_APP_KEY);
    await storage.migrate();

    return {
      storage,
      async withKeys(keys) {
        return KnexStorage.create(database, DEFAULT_TABLES, keys);
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
