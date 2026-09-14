import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import { runMigrations } from '../../../src/infrastructure/storage/knex/auto-migrate';
import { PayloadCipher } from '../../../src/infrastructure/storage/knex/encryption';
import { RequestMetadata } from '../../../src/infrastructure/storage/knex/models/request-metadata';
import { CONTRACT_APP_KEY } from '../contract/types';

const url = process.env.SISP_TEST_MYSQL_URL;

describe.skipIf(url === undefined)('request metadata retention cutoff on mysql', () => {
  let db: ReturnType<typeof knexFactory>;
  let model: RequestMetadata;

  beforeAll(async () => {
    db = knexFactory({ client: 'mysql2', connection: url });

    await runMigrations(db, DEFAULT_TABLES);

    model = new RequestMetadata(db, DEFAULT_TABLES, new PayloadCipher(CONTRACT_APP_KEY));
  }, 60_000);

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db(DEFAULT_TABLES.requestMetadata).delete();
    await db(DEFAULT_TABLES.requestMetadata).insert({
      ip_address: '203.0.113.20',
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  it('keeps rows newer than a cutoff in the past', async () => {
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();

    expect(await model.countOlderThan(cutoff)).toBe(0);
    expect(await model.purgeOlderThan(cutoff, 100)).toBe(0);
    expect(await db(DEFAULT_TABLES.requestMetadata).count({ total: '*' })).toEqual([{ total: 1 }]);
  });

  it('deletes rows older than a cutoff in the future', async () => {
    const cutoff = new Date(Date.now() + 60_000).toISOString();

    expect(await model.countOlderThan(cutoff)).toBe(1);
    expect(await model.purgeOlderThan(cutoff, 100)).toBe(1);
  });

  it('deletes one batch per call and leaves the rest for the next one', async () => {
    for (const address of ['203.0.113.21', '203.0.113.22']) {
      await db(DEFAULT_TABLES.requestMetadata).insert({
        ip_address: address,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    const cutoff = new Date(Date.now() + 60_000).toISOString();

    expect(await model.countOlderThan(cutoff)).toBe(3);
    expect(await model.purgeOlderThan(cutoff, 2)).toBe(2);
    expect(await model.countOlderThan(cutoff)).toBe(1);
    expect(await model.purgeOlderThan(cutoff, 2)).toBe(1);
    expect(await model.countOlderThan(cutoff)).toBe(0);
  });
});
