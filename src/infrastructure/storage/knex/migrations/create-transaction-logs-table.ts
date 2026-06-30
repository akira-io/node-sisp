import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';

export async function createTransactionLogsTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.transactionLogs)) {
    return;
  }

  await db.schema.createTable(tables.transactionLogs, (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('transaction_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable(tables.transactions)
      .onDelete('CASCADE');
    table.string('source').notNullable().defaultTo('model');
    table.json('changed_attributes').notNullable();
    table.json('old_values').nullable();
    table.json('new_values').nullable();
    table.timestamps();
    table.index(['transaction_id', 'created_at']);
    table.index(['source', 'created_at']);
  });
}
