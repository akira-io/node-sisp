import { describe } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';
import { runStorageContract } from './contract';

describe('KnexStorage', () => {
  runStorageContract(async () => {
    const storage = KnexStorage.create(
      {
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        autoMigrate: true,
      },
      DEFAULT_TABLES,
      'app-key',
    );
    await storage.migrate();

    return storage;
  });
});
