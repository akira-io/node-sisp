import { expect, it, vi } from 'vitest';
import { createSisp } from '../../src/index';
import { stubStorage } from '../helpers/stub-storage';

function loaded(module: string): never {
  throw new Error(`The published entry loaded the drizzle adapter module ${module}.`);
}

vi.mock('../../src/infrastructure/storage/drizzle/index', () => loaded('index'));
vi.mock('../../src/infrastructure/storage/drizzle/drizzle-storage', () =>
  loaded('drizzle-storage'),
);
vi.mock('../../src/infrastructure/storage/drizzle/client', () => loaded('client'));
vi.mock('../../src/infrastructure/storage/drizzle/queries', () => loaded('queries'));
vi.mock('../../src/infrastructure/storage/drizzle/mapping', () => loaded('mapping'));
vi.mock('../../src/infrastructure/storage/drizzle/migrations', () => loaded('migrations'));
vi.mock('../../src/infrastructure/storage/drizzle/serialization', () => loaded('serialization'));
vi.mock('../../src/infrastructure/storage/drizzle/schema/index', () => loaded('schema'));
vi.mock('drizzle-orm', () => loaded('drizzle-orm'));
vi.mock('drizzle-orm/pg-core', () => loaded('drizzle-orm/pg-core'));
vi.mock('drizzle-orm/mysql-core', () => loaded('drizzle-orm/mysql-core'));
vi.mock('drizzle-orm/sqlite-core', () => loaded('drizzle-orm/sqlite-core'));

it('builds a Sisp from the published entry without loading the drizzle adapter', async () => {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'X',
    appKey: 'app-key-with-thirty-two-characters!',
    storage: stubStorage(),
  });

  expect(sisp.storage).toBeDefined();

  await sisp.destroy();
});
