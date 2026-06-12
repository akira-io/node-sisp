import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import type { TransactionLogRecord } from '../records';

export class TransactionLogRepository {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
  ) {}

  async listByTransaction(transactionId: number): Promise<TransactionLogRecord[]> {
    const rows = await this.db(this.tables.transactionLogs)
      .where('transaction_id', transactionId)
      .orderBy('id');

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
