import { eq } from 'drizzle-orm';
import type { TransactionLogRepository } from '../../../../core/contracts/storage';
import type { TransactionLogRecord } from '../../../../domain/records';
import type { ListByTransactionOptions } from '../../../../domain/storage-types';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { decodeLogValues, readLogValues } from '../../knex/models/transaction-log';
import { drizzleColumnCodec } from '../column-codecs';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

function changedAttributes(value: unknown): string[] {
  const decoded = drizzleColumnCodec('transactionLogs', 'changed_attributes').decode(value);

  return Array.isArray(decoded) ? (decoded as string[]) : [];
}

export function makeTransactionLogRepository(context: RepositoryContext): TransactionLogRepository {
  const rows = () => gateway(context, 'transactionLogs');

  return {
    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<TransactionLogRecord[]> {
      const table = rows();
      const found = await table.all(eq(table.column('transaction_id'), transactionId), {
        orderBy: [table.ordered('id', normalizeListOrder(options.order))],
        limit: normalizeListLimit(options.limit),
        offset: normalizeListOffset(options.offset),
      });

      return found.map((row) => {
        const normalized = normalizeRow('transactionLogs', row);

        return {
          ...(normalized as unknown as TransactionLogRecord),
          changed_attributes: changedAttributes(normalized.changed_attributes),
          old_values: readLogValues(
            decodeLogValues(
              drizzleColumnCodec('transactionLogs', 'old_values'),
              normalized.old_values,
            ),
            context.cipher,
          ),
          new_values: readLogValues(
            decodeLogValues(
              drizzleColumnCodec('transactionLogs', 'new_values'),
              normalized.new_values,
            ),
            context.cipher,
          ),
        };
      });
    },
  };
}
