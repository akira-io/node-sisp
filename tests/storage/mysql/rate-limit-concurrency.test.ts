import { drizzle } from 'drizzle-orm/mysql2';
import knexFactory from 'knex';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { SispStorage } from '../../../src/core/contracts/storage';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';
import { runMigrations } from '../../../src/infrastructure/storage/knex/auto-migrate';
import { KnexStorage } from '../../../src/infrastructure/storage/knex/knex-storage';

const url = process.env.SISP_TEST_MYSQL_URL;

describe.skipIf(url === undefined)('rate limits under REPEATABLE READ', () => {
  let migrator: ReturnType<typeof knexFactory>;
  let pool: mysql.Pool;
  let drizzleStorage: SispStorage;

  beforeAll(async () => {
    migrator = knexFactory({ client: 'mysql2', connection: url });
    await runMigrations(migrator, DEFAULT_TABLES);

    pool = mysql.createPool({ uri: url as string, connectionLimit: 4 });
    drizzleStorage = createDrizzleStorage(drizzle(pool), DEFAULT_TABLES, 'app-key', {
      dialect: 'mysql',
    });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await migrator.destroy();
  });

  // TODO(@kidiatoliny): knex insert-ignore deadlocks without retry and writes ISO `Z` timestamps MySQL strict mode rejects; tracked in #147.
  it.skip('counts both hits when two transactions create the same row at once', async () => {
    const knexStorage = await KnexStorage.create(
      { client: 'mysql2', connection: url as string, autoMigrate: false },
      DEFAULT_TABLES,
      'app-key',
    );

    try {
      const identifier = `concurrent-${process.hrtime.bigint()}`;
      const params = { identifier, limitType: 'ip', limit: 10, windowSeconds: 60 };

      const [first, second] = await Promise.all([
        knexStorage.rateLimits.hit(params),
        knexStorage.rateLimits.hit(params),
      ]);

      expect(first).toBe(false);
      expect(second).toBe(false);

      const rows = await (migrator as ReturnType<typeof knexFactory>)(DEFAULT_TABLES.rateLimits)
        .where({ identifier, limit_type: 'ip', context: '' })
        .select('hits');

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]?.hits)).toBe(2);
    } finally {
      await knexStorage.destroy();
    }
  });

  it('counts both hits on the drizzle adapter too', async () => {
    const identifier = `concurrent-drizzle-${process.hrtime.bigint()}`;
    const params = { identifier, limitType: 'ip', limit: 10, windowSeconds: 60 };

    const [first, second] = await Promise.all([
      drizzleStorage.rateLimits.hit(params),
      drizzleStorage.rateLimits.hit(params),
    ]);

    expect(first).toBe(false);
    expect(second).toBe(false);

    const rows = await (migrator as ReturnType<typeof knexFactory>)(DEFAULT_TABLES.rateLimits)
      .where({ identifier, limit_type: 'ip', context: '' })
      .select('hits');

    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.hits)).toBe(2);
  });
});
