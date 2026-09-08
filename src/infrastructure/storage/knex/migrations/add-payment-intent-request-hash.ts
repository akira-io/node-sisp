import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';

export async function addPaymentIntentRequestHash(db: Knex, tables: SispTables): Promise<void> {
  if (!(await db.schema.hasTable(tables.paymentIntents))) {
    return;
  }

  if (await db.schema.hasColumn(tables.paymentIntents, 'request_hash')) {
    return;
  }

  await db.schema.alterTable(tables.paymentIntents, (table) => {
    table.string('request_hash', 64).nullable();
  });
}
