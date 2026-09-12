import { eq } from 'drizzle-orm';
import type { TransactionLogRepository } from '../../../../core/contracts/storage';
import type { TransactionLogRecord } from '../../../../domain/records';
import type { ListByTransactionOptions } from '../../../../domain/storage-types';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { readLogValues } from '../../knex/models/transaction-log';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

function asJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return (value as T) ?? fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
          changed_attributes: asJson<string[]>(normalized.changed_attributes, []),
          old_values: readLogValues(
            asJson<Record<string, unknown> | null>(normalized.old_values, null),
            context.cipher,
          ),
          new_values: readLogValues(
            asJson<Record<string, unknown> | null>(normalized.new_values, null),
            context.cipher,
          ),
        };
      });
    },
  };
}
