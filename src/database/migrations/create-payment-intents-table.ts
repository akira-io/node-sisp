import type { Knex } from 'knex';
import type { SispTables } from '../../config';

export async function createPaymentIntentsTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.paymentIntents)) {
    return;
  }

  await db.schema.createTable(tables.paymentIntents, (table) => {
    table.bigIncrements('id');
    table.string('idempotency_key').notNullable().unique();
    table
      .bigInteger('transaction_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable(tables.transactions)
      .onDelete('SET NULL');
    table.string('status').notNullable().defaultTo('processing');
    table.text('failure_reason').nullable();
    table.timestamps();
    table.index(['transaction_id', 'status']);
  });
}
