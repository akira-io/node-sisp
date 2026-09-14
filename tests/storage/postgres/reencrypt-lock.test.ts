import { drizzle } from 'drizzle-orm/node-postgres';
import knexFactory, { type Knex } from 'knex';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { SispStorage } from '../../../src/core/contracts/storage';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';
import { runMigrations } from '../../../src/infrastructure/storage/knex/auto-migrate';
import { KnexStorage } from '../../../src/infrastructure/storage/knex/knex-storage';
import { CONTRACT_APP_KEY } from '../contract/types';

const connectionString = process.env.SISP_TEST_POSTGRES_URL || undefined;
const SCHEMA_NAME = `sisp_lock_${process.pid}`;
const SEARCH_PATH = `-c search_path=${SCHEMA_NAME}`;
const BLOCKED_FOR_MS = 400;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

async function seed(storage: SispStorage, tag: string): Promise<number> {
  const created = await storage.transactions.create({
    merchantRef: `REF-${tag}`,
    merchantSession: `SES-${tag}`,
    amount: 100,
    payload: { posID: '90051' },
  });

  return created.id;
}

describe.skipIf(connectionString === undefined)('the rekey locked read on postgres', () => {
  let admin: Pool;
  let migrator: Knex;
  let holder: Knex;
  let pool: Pool;

  beforeAll(async () => {
    admin = new Pool({ connectionString, max: 1 });

    await admin.query(`drop schema if exists "${SCHEMA_NAME}" cascade`);
    await admin.query(`create schema "${SCHEMA_NAME}"`);

    migrator = knexFactory({
      client: 'pg',
      connection: { connectionString, options: SEARCH_PATH },
    });

    await runMigrations(migrator, DEFAULT_TABLES);

    holder = knexFactory({
      client: 'pg',
      connection: { connectionString, options: SEARCH_PATH },
    });
    pool = new Pool({ connectionString, max: 4, options: SEARCH_PATH });
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await holder?.destroy();
    await migrator?.destroy();
    await admin.query(`drop schema if exists "${SCHEMA_NAME}" cascade`);
    await admin.end();
  });

  async function whileRowIsLocked(
    id: number,
    batch: () => Promise<{ processed: number; current: number }>,
  ) {
    const locked = deferred();
    const release = deferred();
    const held = holder.transaction(async (trx) => {
      await trx(DEFAULT_TABLES.transactions).where('id', id).forUpdate().first();

      locked.resolve();

      await release.promise;
    });

    await locked.promise;

    let settled = false;
    const running = batch().then((result) => {
      settled = true;

      return result;
    });

    await new Promise((wait) => setTimeout(wait, BLOCKED_FOR_MS));

    const settledWhileLocked = settled;

    release.resolve();
    await held;

    return { settledWhileLocked, result: await running };
  }

  it('makes the knex rotation wait for a lock another transaction holds', async () => {
    const storage = await KnexStorage.create(
      {
        client: 'pg',
        connection: { connectionString, options: SEARCH_PATH },
        autoMigrate: false,
      },
      DEFAULT_TABLES,
      CONTRACT_APP_KEY,
    );

    try {
      const id = await seed(storage, 'PG-LOCK-KNEX');

      const { settledWhileLocked, result } = await whileRowIsLocked(id, () =>
        storage.maintenance.reencryptBatch({
          table: 'transactions',
          columns: [{ name: 'payload' }],
          afterId: id - 1,
          limit: 1,
        }),
      );

      expect(settledWhileLocked).toBe(false);
      expect(result).toMatchObject({ processed: 1, current: 1 });
    } finally {
      await storage.destroy();
    }
  }, 30_000);

  it('makes the drizzle rotation wait for a lock another transaction holds', async () => {
    const storage = createDrizzleStorage(drizzle(pool), DEFAULT_TABLES, CONTRACT_APP_KEY, {
      dialect: 'postgresql',
    });
    const id = await seed(storage, 'PG-LOCK-DRIZZLE');

    const { settledWhileLocked, result } = await whileRowIsLocked(id, () =>
      storage.maintenance.reencryptBatch({
        table: 'transactions',
        columns: [{ name: 'payload' }],
        afterId: id - 1,
        limit: 1,
      }),
    );

    expect(settledWhileLocked).toBe(false);
    expect(result).toMatchObject({ processed: 1, current: 1 });
  }, 30_000);
});
