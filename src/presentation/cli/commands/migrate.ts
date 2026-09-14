import { resolveConfig } from '../../../application/config';
import { runMigrations } from '../../../infrastructure/storage/knex/auto-migrate';
import { createKnexInstance } from '../../../infrastructure/storage/knex/create-knex';
import { type CliOptions, loadConfigFile } from '../support';

export async function migrate(
  _argv: string[],
  options: CliOptions,
  output: (line: string) => void,
): Promise<number> {
  const config = await (options.loadConfig ?? loadConfigFile)();
  const resolved = resolveConfig(config);

  if (!resolved.database) {
    throw new Error('The `migrate` command requires a `database` configuration.');
  }

  const db = await createKnexInstance(resolved.database);

  try {
    const ran = await runMigrations(db, resolved.tables);

    if (ran.length === 0) {
      output('Nothing to migrate.');

      return 0;
    }

    for (const name of ran) {
      output(`Migrated: ${name}`);
    }

    return 0;
  } finally {
    await db.destroy();
  }
}
