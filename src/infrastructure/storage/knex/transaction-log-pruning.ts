import type { Knex } from 'knex';
import type { SispTables } from '../../../application/config';

const MAX_TRANSACTION_LOGS_PER_TRANSACTION = 100;
const LOG_RETENTION_PRUNE_BATCH = 100;

export async function pruneTransactionLogs(
  db: Knex,
  tables: SispTables,
  transactionId: number,
): Promise<void> {
  const staleRows = await db(tables.transactionLogs)
    .select('id')
    .where('transaction_id', transactionId)
    .orderBy('id', 'desc')
    .offset(MAX_TRANSACTION_LOGS_PER_TRANSACTION)
    .limit(LOG_RETENTION_PRUNE_BATCH);
  const staleIds = staleRows.map((row: Record<string, unknown>) => Number(row.id));

  if (staleIds.length === 0) {
    return;
  }

  await db(tables.transactionLogs).whereIn('id', staleIds).delete();
}
