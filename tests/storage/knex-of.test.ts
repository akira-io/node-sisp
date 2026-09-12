import { expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import { knexOf } from '../../src/infrastructure/storage/knex';
import { stubStorage } from '../helpers/stub-storage';

it('returns no handle when the storage is not knex-backed', async () => {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'X',
    appKey: 'app-key-with-thirty-two-characters!',
    storage: stubStorage(),
  });

  expect(knexOf(sisp)).toBeUndefined();

  await sisp.destroy();
});

it('returns the knex instance backing a database-configured Sisp', async () => {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'X',
    appKey: 'app-key-with-thirty-two-characters!',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
  const db = knexOf(sisp);

  expect(db).toBeTypeOf('function');
  expect(await db?.raw('select 1 as one')).toBeDefined();

  await sisp.destroy();
});
