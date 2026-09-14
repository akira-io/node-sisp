import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import { isIndexAlreadyExistsError } from '../../../../support/database-errors';

export async function addRequestMetadataCreatedAtIndex(
  db: Knex,
  tables: SispTables,
): Promise<void> {
  if (!(await db.schema.hasTable(tables.requestMetadata))) {
    return;
  }

  try {
    await db.schema.alterTable(tables.requestMetadata, (table) => {
      table.index(['created_at']);
    });
  } catch (error) {
    if (!isIndexAlreadyExistsError(error)) {
      throw error;
    }
  }
}
