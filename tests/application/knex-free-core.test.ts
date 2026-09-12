import { expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import { stubStorage } from '../helpers/stub-storage';

function loaded(module: string): never {
  throw new Error(`The core entry loaded the knex adapter module ${module}.`);
}

vi.mock('../../src/infrastructure/storage/knex/knex-storage', () => loaded('knex-storage'));
vi.mock('../../src/infrastructure/storage/knex/create-knex', () => loaded('create-knex'));
vi.mock('../../src/infrastructure/storage/knex/index', () => loaded('index'));

it('builds a Sisp over an injected storage without loading the knex adapter', async () => {
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'X',
    appKey: 'app-key-with-thirty-two-characters!',
    storage: stubStorage(),
  });

  expect(sisp.storage).toBeDefined();
  expect('db' in sisp).toBe(false);

  await sisp.destroy();
});
