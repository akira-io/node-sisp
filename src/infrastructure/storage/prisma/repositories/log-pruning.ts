import type { SispTables } from '../../../../application/config';
import { DELEGATE_NAMES, delegate, type PrismaClientLike } from '../client';

const MAX_TRANSACTION_LOGS_PER_TRANSACTION = 100;
const LOG_RETENTION_PRUNE_BATCH = 100;

export async function pruneTransactionLogs(
  client: PrismaClientLike,
  _tables: SispTables,
  transactionId: number,
): Promise<void> {
  const logs = delegate(client, DELEGATE_NAMES.transactionLogs);

  const staleRows = await logs.findMany({
    where: { transactionId: BigInt(transactionId) },
    orderBy: { id: 'desc' },
    skip: MAX_TRANSACTION_LOGS_PER_TRANSACTION,
    take: LOG_RETENTION_PRUNE_BATCH,
    select: { id: true },
  });

  if (staleRows.length === 0) {
    return;
  }

  const staleIds = staleRows.map((row) => row.id as bigint);

  await logs.deleteMany({ where: { id: { in: staleIds } } });
}
