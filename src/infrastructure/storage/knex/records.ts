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

export function nowIso(): string {
  return new Date().toISOString();
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
