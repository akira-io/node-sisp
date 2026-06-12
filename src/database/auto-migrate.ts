import type { Knex } from 'knex';
import type { SispTables } from '../config';
import { SISP_MIGRATIONS } from './migrations';

export const MIGRATIONS_TABLE = 'sisp_migrations';

export async function runMigrations(db: Knex, tables: SispTables): Promise<string[]> {
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
