import { expectTypeOf, test } from 'vitest';
import type { SispConfig } from '../../src/application/config';
import type { SispKnexDatabaseConfig } from '../../src/infrastructure/storage/knex';

test('SispKnexDatabaseConfig is assignable to SispConfig.database', () => {
  expectTypeOf<SispKnexDatabaseConfig>().toExtend<NonNullable<SispConfig['database']>>();
});

test('SispKnexDatabaseConfig accepts a knex connection provider function', () => {
  const config: SispKnexDatabaseConfig = {
    client: 'pg',
    connection: () => ({ host: 'db.internal', user: 'app', password: 'token', database: 'sisp' }),
  };

  expectTypeOf(config).toMatchTypeOf<SispKnexDatabaseConfig>();
});
