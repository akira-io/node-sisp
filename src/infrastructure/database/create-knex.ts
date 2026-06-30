import knexFactory, { type Knex } from 'knex';
import type { SispDatabaseConfig } from '../../application/config';

export function createKnexInstance(config: SispDatabaseConfig): Knex {
  const sqlite = config.client === 'better-sqlite3';

  return knexFactory({
    client: config.client,
    connection: config.connection,
    useNullAsDefault: sqlite,
    pool: sqlite ? { min: 1, max: 1 } : undefined,
  });
}
