import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';
import { runStorageContract } from '../contract';
import { postgresStoredJsonType } from '../json-type';

const connectionString = process.env.SISP_TEST_POSTGRES_URL || undefined;

const DATABASE_NAME = `sisp_drizzle_${process.pid}`;

function urlFor(database: string): string {
  const url = new URL(connectionString as string);

  url.pathname = `/${database}`;

  return url.toString();
}

describe.skipIf(connectionString === undefined)('DrizzleStorage (postgres)', () => {
  const admin = new Pool({ connectionString, max: 1 });
  const pool = new Pool({ connectionString: urlFor(DATABASE_NAME), max: 4 });
  const db = drizzle(pool);

  const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', {
    dialect: 'postgresql',
    autoMigrate: true,
  });

  beforeAll(async () => {
    await admin.query(`drop database if exists "${DATABASE_NAME}"`);
    await admin.query(`create database "${DATABASE_NAME}"`);

    await storage.migrate?.();
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await admin.query(`drop database if exists "${DATABASE_NAME}"`);
    await admin.end();
  });

  it('creates every SISP table from the generated DDL', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      'select table_name from information_schema.tables where table_schema = current_schema() and table_name = any($1)',
      [Object.values(DEFAULT_TABLES)],
    );
    const present = rows.map((row) => row.table_name);

    for (const table of Object.values(DEFAULT_TABLES)) {
      expect(present).toContain(table);
    }
  });

  it('is idempotent when the tables already exist', async () => {
    await expect(storage.migrate?.()).resolves.not.toThrow();
  });

  it('declares the foreign keys the canonical schema declares', async () => {
    const { rows } = await pool.query<{ table_name: string; delete_rule: string }>(
      `select tc.table_name, rc.delete_rule
         from information_schema.table_constraints tc
         join information_schema.referential_constraints rc
           on rc.constraint_name = tc.constraint_name
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = current_schema()
          and tc.table_name = any($1)`,
      [Object.values(DEFAULT_TABLES)],
    );

    expect(rows.map((row) => row.table_name).sort()).toEqual(
      [
        DEFAULT_TABLES.invoices,
        DEFAULT_TABLES.paymentIntents,
        DEFAULT_TABLES.requestMetadata,
        DEFAULT_TABLES.transactionAttempts,
        DEFAULT_TABLES.transactionItems,
        DEFAULT_TABLES.transactionLogs,
      ].sort(),
    );
    expect(rows.find((row) => row.table_name === DEFAULT_TABLES.paymentIntents)?.delete_rule).toBe(
      'SET NULL',
    );
    expect(
      rows.find((row) => row.table_name === DEFAULT_TABLES.transactionItems)?.delete_rule,
    ).toBe('CASCADE');
  });

  const truncateAll = Object.values(DEFAULT_TABLES)
    .map((table) => `"${table}"`)
    .join(', ');

  runStorageContract(async () => {
    await pool.query(`truncate table ${truncateAll} restart identity cascade`);

    return {
      storage,
      async storedJsonType(table, column, id) {
        return postgresStoredJsonType(
          async (sql, values) => (await pool.query(sql, values)).rows[0],
          table,
          column,
          id,
        );
      },
    };
  });
});
