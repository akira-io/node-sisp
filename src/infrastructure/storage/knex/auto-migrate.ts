import type { Knex } from 'knex';
import type { SispTables } from '../../../application/config';
import { SISP_MIGRATIONS } from './migrations';

export const MIGRATIONS_TABLE = 'sisp_migrations';
const MIGRATION_LOCK_KEY = 0x53495350;
const MIGRATION_LOCK_NAME = 'node-sisp:migrations';

let processMigrationLock = Promise.resolve();

export async function runMigrations(db: Knex, tables: SispTables): Promise<string[]> {
  return withMigrationLock(db, (connection) => runMigrationsUnlocked(connection, tables));
}

async function runMigrationsUnlocked(db: Knex, tables: SispTables): Promise<string[]> {
  await ensureMigrationsTable(db);

  const rows = await db(MIGRATIONS_TABLE).select('name');
  const executed = new Set(rows.map((row: { name: string }) => row.name));
  const ran: string[] = [];

  for (const migration of SISP_MIGRATIONS) {
    if (executed.has(migration.name)) {
      continue;
    }

    await migration.up(db, tables);
    await db(MIGRATIONS_TABLE).insert({
      name: migration.name,
      migrated_at: new Date().toISOString(),
    });
    ran.push(migration.name);
  }

  return ran;
}

async function withMigrationLock<T>(
  db: Knex,
  callback: (connection: Knex) => Promise<T>,
): Promise<T> {
  const client = String(db.client.config.client);

  if (client === 'pg') {
    return db.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(?)', [MIGRATION_LOCK_KEY]);

      return callback(trx);
    });
  }

  if (client === 'mysql2') {
    await db.raw('select get_lock(?, 30)', [MIGRATION_LOCK_NAME]);

    try {
      return await callback(db);
    } finally {
      await db.raw('select release_lock(?)', [MIGRATION_LOCK_NAME]);
    }
  }

  return withProcessMigrationLock(() => callback(db));
}

async function withProcessMigrationLock<T>(callback: () => Promise<T>): Promise<T> {
  const previous = processMigrationLock;
  let release!: () => void;

  processMigrationLock = previous.then(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );

  await previous;

  try {
    return await callback();
  } finally {
    release();
  }
}

async function ensureMigrationsTable(db: Knex): Promise<void> {
  if (await db.schema.hasTable(MIGRATIONS_TABLE)) {
    return;
  }

  await db.schema.createTable(MIGRATIONS_TABLE, (table) => {
    table.increments('id');
    table.string('name').notNullable().unique();
    table.string('migrated_at').notNullable();
  });
}
