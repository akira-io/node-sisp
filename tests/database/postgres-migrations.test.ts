import knexFactory, { type Knex } from 'knex';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import {
  MIGRATIONS_TABLE,
  runMigrations,
} from '../../src/infrastructure/storage/knex/auto-migrate';

const connectionString = process.env.SISP_TEST_POSTGRES_URL;

describe.skipIf(connectionString === undefined)('postgres migrations', () => {
  let db: Knex;

  beforeEach(async () => {
    db = knexFactory({ client: 'pg', connection: connectionString });

    const tables = [...Object.values(DEFAULT_TABLES), MIGRATIONS_TABLE];

    for (const table of tables) {
      await db.raw(`drop table if exists ?? cascade`, [table]);
    }
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it('runs every migration against an empty database', async () => {
    const ran = await runMigrations(db, DEFAULT_TABLES);

    expect(ran.length).toBeGreaterThan(0);
    expect(await db.schema.hasTable(DEFAULT_TABLES.transactions)).toBe(true);
    expect(await db.schema.hasTable(DEFAULT_TABLES.rateLimits)).toBe(true);
  });

  it('leaves the shared transaction usable when a migration re-adds an existing constraint', async () => {
    const ran = await runMigrations(db, DEFAULT_TABLES);

    expect(ran).toContain('0005_add_rate_limit_unique_index');

    const recorded = await db(MIGRATIONS_TABLE).select('name');

    expect(recorded).toHaveLength(ran.length);
  });

  it('is a no-op on a second run', async () => {
    await runMigrations(db, DEFAULT_TABLES);

    expect(await runMigrations(db, DEFAULT_TABLES)).toEqual([]);
  });
});
