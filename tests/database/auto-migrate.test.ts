import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES, type SispTables } from '../../src/application/config';
import {
  MIGRATIONS_TABLE,
  runMigrations,
} from '../../src/infrastructure/storage/knex/auto-migrate';
import { createKnexInstance } from '../../src/infrastructure/storage/knex/create-knex';

let db: Knex;

beforeEach(async () => {
  db = await createKnexInstance({ client: 'better-sqlite3', connection: { filename: ':memory:' } });
});

afterEach(async () => {
  await db.destroy();
});

describe('runMigrations', () => {
  it('creates every SISP table plus the control table', async () => {
    const ran = await runMigrations(db, DEFAULT_TABLES);

    expect(ran).toEqual([
      '0001_create_sisp_tables',
      '0002_create_transaction_logs_table',
      '0003_create_transaction_attempts_table',
      '0004_create_payment_intents_table',
      '0005_add_rate_limit_unique_index',
      '0006_add_payment_intent_request_hash',
      '0007_add_transaction_pos_id',
      '0008_add_request_metadata_created_at_index',
    ]);

    for (const table of Object.values(DEFAULT_TABLES)) {
      expect(await db.schema.hasTable(table)).toBe(true);
    }

    expect(await db.schema.hasTable(MIGRATIONS_TABLE)).toBe(true);
  });

  it('is idempotent across repeated runs', async () => {
    await runMigrations(db, DEFAULT_TABLES);
    const secondRun = await runMigrations(db, DEFAULT_TABLES);

    expect(secondRun).toEqual([]);

    const rows = await db(MIGRATIONS_TABLE).select('name');

    expect(rows).toHaveLength(8);
  });

  it('serializes concurrent migration runs', async () => {
    const runs = await Promise.all([
      runMigrations(db, DEFAULT_TABLES),
      runMigrations(db, DEFAULT_TABLES),
    ]);
    const ran = runs.flat();

    expect(ran.sort()).toEqual([
      '0001_create_sisp_tables',
      '0002_create_transaction_logs_table',
      '0003_create_transaction_attempts_table',
      '0004_create_payment_intents_table',
      '0005_add_rate_limit_unique_index',
      '0006_add_payment_intent_request_hash',
      '0007_add_transaction_pos_id',
      '0008_add_request_metadata_created_at_index',
    ]);
    expect(await db(MIGRATIONS_TABLE).select('name')).toHaveLength(8);
  });

  it('survives a lost control table when the schema already exists', async () => {
    await runMigrations(db, DEFAULT_TABLES);
    await db.schema.dropTable(MIGRATIONS_TABLE);

    const ran = await runMigrations(db, DEFAULT_TABLES);

    expect(ran).toEqual([
      '0001_create_sisp_tables',
      '0002_create_transaction_logs_table',
      '0003_create_transaction_attempts_table',
      '0004_create_payment_intents_table',
      '0005_add_rate_limit_unique_index',
      '0006_add_payment_intent_request_hash',
      '0007_add_transaction_pos_id',
      '0008_add_request_metadata_created_at_index',
    ]);
    expect(await db.schema.hasTable(DEFAULT_TABLES.transactions)).toBe(true);
  });

  it('honors custom table names', async () => {
    const tables: SispTables = {
      ...DEFAULT_TABLES,
      transactions: 'custom_transactions',
      transactionLogs: 'custom_logs',
    };

    await runMigrations(db, tables);

    expect(await db.schema.hasTable('custom_transactions')).toBe(true);
    expect(await db.schema.hasTable('custom_logs')).toBe(true);
    expect(await db.schema.hasTable(DEFAULT_TABLES.transactions)).toBe(false);
  });

  it('indexes request metadata on created_at alone so the purge can seek', async () => {
    await runMigrations(db, DEFAULT_TABLES);

    const indexes = (await db.raw(`pragma index_list(${DEFAULT_TABLES.requestMetadata})`)) as {
      name: string;
    }[];
    const columnsPerIndex = await Promise.all(
      indexes.map(async (index) =>
        ((await db.raw(`pragma index_info(${index.name})`)) as { name: string }[]).map(
          (column) => column.name,
        ),
      ),
    );

    expect(columnsPerIndex).toContainEqual(['created_at']);
  });

  it('creates the transactions schema expected by the Laravel package', async () => {
    await runMigrations(db, DEFAULT_TABLES);

    for (const column of [
      'merchant_ref',
      'merchant_session',
      'amount_cents',
      'currency',
      'status',
      'transaction_code',
      'transaction_id',
      'message_type',
      'response_code',
      'merchant_response',
      'fingerprint',
      'payload',
      'customer_email',
      'locale',
      'cancelled_at',
      'refunded_at',
      'created_at',
      'updated_at',
    ]) {
      expect(await db.schema.hasColumn(DEFAULT_TABLES.transactions, column)).toBe(true);
    }

    expect(await db.schema.hasColumn(DEFAULT_TABLES.transactions, 'amount')).toBe(false);
  });
});
