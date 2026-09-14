import type { Knex } from 'knex';

export type {
  BlacklistRecord,
  InvoiceRecord,
  PaymentIntentRecord,
  RequestMetadataRecord,
  TransactionAttemptRecord,
  TransactionItemRecord,
  TransactionLogRecord,
  TransactionRecord,
} from '../../../domain/records';

const SQLITE_CLIENTS = ['better-sqlite3', 'sqlite3'];

export function nowIso(): string {
  return new Date().toISOString();
}

export function timestampValue(db: Knex, iso: string): string | Date {
  return SQLITE_CLIENTS.includes(String(db.client.config.client)) ? iso : new Date(iso);
}

export function transactionPayloadRecord(
  transaction: import('../../../domain/records').TransactionRecord,
): Record<string, unknown> {
  const payload = transaction.payload;

  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
}
