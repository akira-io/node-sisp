import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import type { ColumnCodec } from '../../column-codec';
import { knexColumnCodec } from '../column-codecs';
import type { PayloadCipher } from '../encryption';
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
    private readonly cipher: PayloadCipher,
  ) {}

  withConnection(connection: Knex): TransactionLog {
    return new TransactionLog(connection, this.tables, this.cipher);
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
      old_values: readLogValues(
        decodeLogValues(knexColumnCodec('transactionLogs', 'old_values'), row.old_values),
        this.cipher,
      ),
      new_values: readLogValues(
        decodeLogValues(knexColumnCodec('transactionLogs', 'new_values'), row.new_values),
        this.cipher,
      ),
    }));
  }
}

export function decodeLogValues(
  codec: ColumnCodec,
  stored: unknown,
): Record<string, unknown> | null {
  const decoded = codec.decode(stored);

  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return null;
  }

  return decoded as Record<string, unknown>;
}

export function readLogValues(
  values: Record<string, unknown> | null,
  cipher: PayloadCipher,
): Record<string, unknown> | null {
  if (values === null || typeof values.payload !== 'string') {
    return values;
  }

  return { ...values, payload: cipher.read(values.payload) };
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
