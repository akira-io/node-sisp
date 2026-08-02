import type { Knex } from 'knex';
import type { SispDatabaseConfig } from '../../../application/config';

export async function createKnexInstance(config: SispDatabaseConfig): Promise<Knex> {
  const sqlite = config.client === 'better-sqlite3';
  const { default: knexFactory } = await loadKnex();

  return knexFactory({
    client: config.client,
    connection: config.connection,
    useNullAsDefault: sqlite,
    pool: sqlite ? { min: 1, max: 1 } : undefined,
  });
}

async function loadKnex(): Promise<typeof import('knex')> {
  try {
    return await import('knex');
  } catch (cause) {
    throw new Error(
      'Stateful SISP mode requires the `knex` package plus a database driver ' +
        '(`pg`, `mysql2`, or `better-sqlite3`) to be installed. ' +
        'Run `bun add knex <driver>`, or switch to `createStatelessSisp` if you do not need built-in persistence.',
      { cause },
    );
  }
}
