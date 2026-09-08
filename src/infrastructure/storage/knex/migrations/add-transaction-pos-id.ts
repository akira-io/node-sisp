import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';

export async function addTransactionPosId(db: Knex, tables: SispTables): Promise<void> {
  if (!(await db.schema.hasTable(tables.transactions))) {
    return;
  }

  if (await db.schema.hasColumn(tables.transactions, 'pos_id')) {
    return;
  }

  await db.schema.alterTable(tables.transactions, (table) => {
    table.string('pos_id', 32).nullable().index();
  });
}
