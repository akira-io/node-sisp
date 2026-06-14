import { type Knex, knex } from 'knex';
import type { SispDatabaseConfig } from '../config';

export function createKnexInstance(config: SispDatabaseConfig): Knex {
  const sqlite = config.client === 'better-sqlite3';

  return knex({
    client: config.client,
    connection: config.connection,
    useNullAsDefault: sqlite,
    pool: sqlite ? { min: 1, max: 1 } : undefined,
  });
}
