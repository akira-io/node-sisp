import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import {
  type ListByTransactionOptions,
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../list-options';
import type { TransactionLogRecord } from '../records';

export class TransactionLog {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
  ) {}

  withConnection(connection: Knex): TransactionLog {
    return new TransactionLog(connection, this.tables);
  }

  async listByTransaction(
    transactionId: number,
    options: ListByTransactionOptions = {},
  ): Promise<TransactionLogRecord[]> {
    const rows = await this.db(this.tables.transactionLogs)
      .where('transaction_id', transactionId)
      .orderBy('id', normalizeListOrder(options.order))
      .limit(normalizeListLimit(options.limit))
      .offset(normalizeListOffset(options.offset));

    return rows.map((row: Record<string, unknown>) => ({
      ...(row as unknown as TransactionLogRecord),
      changed_attributes: parseJsonColumn(row.changed_attributes, []),
      old_values: parseJsonColumn(row.old_values, null),
      new_values: parseJsonColumn(row.new_values, null),
    }));
  }
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return (value as T) ?? fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
