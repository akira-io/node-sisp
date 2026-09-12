import { eq, inArray } from 'drizzle-orm';
import type { RepositoryContext } from './context';
import { gateway } from './context';

const MAX_TRANSACTION_LOGS_PER_TRANSACTION = 100;
const LOG_RETENTION_PRUNE_BATCH = 100;

export async function pruneTransactionLogs(
  context: RepositoryContext,
  transactionId: number,
): Promise<void> {
  const logs = gateway(context, 'transactionLogs');
  const stale = await logs.ids(eq(logs.column('transaction_id'), transactionId), {
    orderBy: [logs.descending('id')],
    offset: MAX_TRANSACTION_LOGS_PER_TRANSACTION,
    limit: LOG_RETENTION_PRUNE_BATCH,
  });

  if (stale.length === 0) {
    return;
  }

  await logs.delete(inArray(logs.column('id'), stale));
}
