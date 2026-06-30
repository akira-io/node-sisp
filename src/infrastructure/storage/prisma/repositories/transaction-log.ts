import type { SispTables } from '../../../../application/config';
import type { TransactionLogRepository } from '../../../../core/contracts/storage';
import type { TransactionLogRecord } from '../../../../domain/records';
import type { ListByTransactionOptions } from '../../../../domain/storage-types';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { DELEGATE_NAMES, delegate, type PrismaClientLike } from '../client';
import { mapTransactionLog } from '../mapping';

export function makeTransactionLogRepository(
  client: PrismaClientLike,
  _tables: SispTables,
): TransactionLogRepository {
  const model = () => delegate(client, DELEGATE_NAMES.transactionLogs);

  return {
    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<TransactionLogRecord[]> {
      const rows = await model().findMany({
        where: { transactionId: BigInt(transactionId) },
        orderBy: { id: normalizeListOrder(options.order) },
        take: normalizeListLimit(options.limit),
        skip: normalizeListOffset(options.offset),
      });

      return rows.map(mapTransactionLog);
    },
  };
}
