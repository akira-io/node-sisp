import type { TransactionRecord } from '../../../../domain/records';
import type { TransactionChanges } from '../../../../domain/storage-types';
import { fromCents, toCents } from '../../../../support/sisp-amount';
import type { PayloadCipher } from '../../knex/encryption';
import { stableStringify } from '../../knex/models/transaction-row';
import type { PrismaRow } from '../mapping';

const MAPPED_COLUMNS: Record<string, string> = {
  transaction_id: 'transactionId',
  message_type: 'messageType',
  response_code: 'responseCode',
  merchant_response: 'merchantResponse',
  merchant_session: 'merchantSession',
  customer_name: 'customerName',
  customer_email: 'customerEmail',
  customer_phone: 'customerPhone',
  customer_country: 'customerCountry',
  customer_city: 'customerCity',
  customer_address: 'customerAddress',
  customer_postal_code: 'customerPostalCode',
  cancelled_at: 'cancelledAt',
  refunded_at: 'refundedAt',
  amount_cents: 'amountCents',
  fingerprint: 'fingerprint',
  status: 'status',
  payload: 'payload',
  locale: 'locale',
};

const DATE_COLUMNS = new Set(['cancelledAt', 'refundedAt']);

export function normalizeChanges(changes: TransactionChanges): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...changes };

  if ('amount' in normalized) {
    const amountCents = toCents(changes.amount ?? 0);

    normalized.amount = fromCents(amountCents);
    normalized.amount_cents = amountCents;
  }

  return normalized;
}

export function computeDiff(
  current: TransactionRecord,
  normalized: Record<string, unknown>,
  cipher: PayloadCipher,
): { changed: string[]; oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const changed: string[] = [];
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [attribute, newValue] of Object.entries(normalized)) {
    const oldValue = current[attribute as keyof TransactionRecord] ?? null;
    const normalizedNew = newValue ?? null;

    if (stableStringify(oldValue) === stableStringify(normalizedNew)) {
      continue;
    }

    changed.push(attribute);
    oldValues[attribute] = attribute === 'payload' ? cipher.store(oldValue) : oldValue;
    newValues[attribute] = attribute === 'payload' ? cipher.store(normalizedNew) : normalizedNew;
  }

  return { changed, oldValues, newValues };
}

export function toWriteData(
  normalized: Record<string, unknown>,
  changed: string[],
  cipher: PayloadCipher,
): PrismaRow {
  const data: PrismaRow = {};

  for (const attribute of changed) {
    if (attribute === 'amount') {
      continue;
    }

    const column = MAPPED_COLUMNS[attribute] ?? attribute;

    if (attribute === 'payload') {
      data[column] = cipher.store(normalized[attribute]);
      continue;
    }

    if (attribute === 'amount_cents') {
      data[column] = BigInt(toCents(normalized.amount as number | string));
      continue;
    }

    const value = normalized[attribute];

    data[column] = DATE_COLUMNS.has(column) && typeof value === 'string' ? new Date(value) : value;
  }

  return data;
}
