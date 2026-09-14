import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES, type SispTables } from '../../../src/application/config';
import { ENCRYPTED_COLUMNS } from '../../../src/core/contracts/maintenance';
import type { SispStorage } from '../../../src/core/contracts/storage';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';
import { CONTRACT_APP_KEY } from '../contract/types';

const url = process.env.SISP_TEST_MYSQL_URL;
const TABLES: SispTables = { ...DEFAULT_TABLES };

for (const key of Object.keys(TABLES) as (keyof SispTables)[]) {
  TABLES[key] = `rekey_${TABLES[key]}`;
}

const ROTATED_KEY = 'mysql-rotation-key';
const UNREADABLE = /no configured key/;

function columnsOf(table: (typeof ENCRYPTED_COLUMNS)[number]['table']) {
  const entry = ENCRYPTED_COLUMNS.find((candidate) => candidate.table === table);

  if (entry === undefined) {
    throw new Error(`No encrypted columns declared for ${table}.`);
  }

  return entry.columns;
}

describe.skipIf(url === undefined)('maintenance.reencryptBatch on mysql', () => {
  let pool: mysql.Pool;
  let storage: SispStorage;

  beforeAll(async () => {
    pool = mysql.createPool({ uri: url as string, connectionLimit: 4 });
    storage = createDrizzleStorage(drizzle(pool), TABLES, CONTRACT_APP_KEY, {
      dialect: 'mysql',
      autoMigrate: true,
    });

    await storage.migrate?.();
  }, 60_000);

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of Object.values(TABLES)) {
      await pool.query(`TRUNCATE TABLE \`${table}\``);
    }

    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  });

  function rotated(): SispStorage {
    return createDrizzleStorage(
      drizzle(pool),
      TABLES,
      { current: ROTATED_KEY, previous: [CONTRACT_APP_KEY] },
      { dialect: 'mysql' },
    );
  }

  it('rewrites the plain ciphertext column', async () => {
    const created = await storage.transactions.create({
      merchantRef: 'MYSQL-REKEY-001',
      merchantSession: 'MYSQL-SES-001',
      amount: 100,
      payload: { posID: '90051' },
    });
    const rotate = rotated();

    const result = await rotate.maintenance.reencryptBatch({
      table: 'transactions',
      columns: columnsOf('transactions'),
      afterId: 0,
      limit: 10,
    });

    expect(result).toMatchObject({
      processed: 1,
      rewritten: 1,
      current: 0,
      plaintext: 0,
      unreadable: 0,
      vanished: 0,
      lastId: created.id,
    });
    expect(result.unreadableValues).toEqual([]);

    const found = await rotate.transactions.findById(created.id);

    expect(found?.payload).toEqual({ posID: '90051' });
    await expect(storage.transactions.findById(created.id)).rejects.toThrow(UNREADABLE);
  });

  it('rewrites the payload nested in the json log values', async () => {
    const created = await storage.transactions.create({
      merchantRef: 'MYSQL-REKEY-002',
      merchantSession: 'MYSQL-SES-002',
      amount: 100,
      payload: { posID: '90051' },
    });

    await storage.transactions.update(created.id, { payload: { posID: '90052' } });

    const rotate = rotated();

    const result = await rotate.maintenance.reencryptBatch({
      table: 'transactionLogs',
      columns: columnsOf('transactionLogs'),
      afterId: 0,
      limit: 10,
    });

    expect(result).toMatchObject({ processed: 1, rewritten: 1, vanished: 0 });
    expect(result.unreadableValues).toEqual([]);

    const [entry] = await rotate.transactionLogs.listByTransaction(created.id);

    expect(entry?.old_values?.payload).toEqual({ posID: '90051' });
    expect(entry?.new_values?.payload).toEqual({ posID: '90052' });
    await expect(storage.transactionLogs.listByTransaction(created.id)).rejects.toThrow(UNREADABLE);
  });

  it('rewrites the json custom metadata column', async () => {
    const created = await storage.transactions.create({
      merchantRef: 'MYSQL-REKEY-003',
      merchantSession: 'MYSQL-SES-003',
      amount: 100,
      payload: { posID: '90051' },
    });

    await storage.requestMetadata.create({
      transaction_id: created.id,
      ip_address: '203.0.113.7',
      custom_metadata: { probe: true },
    });

    const [before] = await storage.requestMetadata.listByTransaction(created.id);
    const rotate = rotated();

    const result = await rotate.maintenance.reencryptBatch({
      table: 'requestMetadata',
      columns: columnsOf('requestMetadata'),
      afterId: 0,
      limit: 10,
    });

    expect(result).toMatchObject({ processed: 1, rewritten: 1, vanished: 0, lastId: before?.id });
    expect(result.unreadableValues).toEqual([]);

    const [after] = await rotate.requestMetadata.listByTransaction(created.id);

    expect(after?.custom_metadata).toEqual({ probe: true });
    await expect(storage.requestMetadata.listByTransaction(created.id)).rejects.toThrow(UNREADABLE);
  });

  it('counts a row that was never encrypted as plaintext, not as current', async () => {
    const created = await storage.transactions.create({
      merchantRef: 'MYSQL-REKEY-004',
      merchantSession: 'MYSQL-SES-004',
      amount: 100,
      payload: { posID: '90051' },
    });

    await pool.query(`update \`${TABLES.transactions}\` set payload = ? where id = ?`, [
      '{"posID":"90051"}',
      created.id,
    ]);

    const result = await rotated().maintenance.reencryptBatch({
      table: 'transactions',
      columns: columnsOf('transactions'),
      afterId: 0,
      limit: 10,
    });

    expect(result).toMatchObject({
      processed: 1,
      rewritten: 0,
      current: 0,
      plaintext: 1,
      unreadable: 0,
      vanished: 0,
    });
    expect(result.unreadableValues).toEqual([]);
  });
});
