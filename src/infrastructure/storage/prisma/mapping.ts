import type {
  BlacklistRecord,
  InvoiceRecord,
  PaymentIntentRecord,
  RequestMetadataRecord,
  TransactionAttemptRecord,
  TransactionItemRecord,
  TransactionLogRecord,
  TransactionRecord,
} from '../../../domain/records';
import type { NewTransaction } from '../../../domain/storage-types';
import { fromCents, toCents } from '../../../support/sisp-amount';
import type { PayloadCipher } from '../knex/encryption';

export type PrismaRow = Record<string, unknown>;

function asIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function asNumber(value: unknown): number {
  return Number(value);
}

function asNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function amountCentsFromRow(row: PrismaRow): number {
  const cents = Number(row.amountCents);

  if (row.amountCents !== null && row.amountCents !== undefined && Number.isFinite(cents)) {
    return cents;
  }

  if (typeof row.amount === 'number' || typeof row.amount === 'string') {
    return toCents(row.amount);
  }

  return 0;
}

export function mapTransaction(row: PrismaRow, cipher: PayloadCipher): TransactionRecord {
  const amountCents = amountCentsFromRow(row);

  return {
    id: asNumber(row.id),
    merchant_ref: row.merchantRef as string,
    merchant_session: row.merchantSession as string,
    amount: fromCents(amountCents),
    amount_cents: amountCents,
    currency: row.currency as string,
    status: row.status as TransactionRecord['status'],
    transaction_code: (row.transactionCode as string | null) ?? null,
    transaction_id: (row.transactionId as string | null) ?? null,
    message_type: (row.messageType as string | null) ?? null,
    response_code: (row.responseCode as string | null) ?? null,
    merchant_response: (row.merchantResponse as string | null) ?? null,
    fingerprint: (row.fingerprint as string | null) ?? null,
    payload: cipher.read(row.payload),
    customer_name: (row.customerName as string | null) ?? null,
    customer_email: (row.customerEmail as string | null) ?? null,
    customer_phone: (row.customerPhone as string | null) ?? null,
    customer_country: (row.customerCountry as string | null) ?? null,
    customer_city: (row.customerCity as string | null) ?? null,
    customer_address: (row.customerAddress as string | null) ?? null,
    customer_postal_code: (row.customerPostalCode as string | null) ?? null,
    locale: row.locale as string,
    cancelled_at: asIso(row.cancelledAt),
    refunded_at: asIso(row.refundedAt),
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function newTransactionToData(
  data: NewTransaction,
  cipher: PayloadCipher,
  timestamp: string,
): PrismaRow {
  return {
    merchantRef: data.merchantRef,
    merchantSession: data.merchantSession,
    amountCents: BigInt(toCents(data.amount)),
    currency: data.currency ?? '132',
    status: 'pending',
    transactionCode: data.transactionCode ?? '1',
    payload: cipher.store(data.payload ?? null),
    locale: data.locale ?? 'pt',
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
  };
}

export function mapTransactionItem(row: PrismaRow): TransactionItemRecord {
  return {
    id: asNumber(row.id),
    transaction_id: asNumber(row.transactionId),
    product_id: (row.productId as string | null) ?? null,
    product_name: row.productName as string,
    quantity: asNumber(row.quantity),
    unit_price_cents: asNumber(row.unitPriceCents),
    total_price_cents: asNumber(row.totalPriceCents),
    description: (row.description as string | null) ?? null,
    metadata: parseJsonColumn(row.metadata),
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function mapTransactionAttempt(
  row: PrismaRow,
  cipher: PayloadCipher,
): TransactionAttemptRecord {
  return {
    id: asNumber(row.id),
    transaction_id: asNumber(row.transactionId),
    attempt_number: asNumber(row.attemptNumber),
    merchant_ref: row.merchantRef as string,
    merchant_session: row.merchantSession as string,
    status: row.status as TransactionAttemptRecord['status'],
    gateway_transaction_id: (row.gatewayTransactionId as string | null) ?? null,
    message_type: (row.messageType as string | null) ?? null,
    response_code: (row.responseCode as string | null) ?? null,
    merchant_response: (row.merchantResponse as string | null) ?? null,
    fingerprint: (row.fingerprint as string | null) ?? null,
    payload: cipher.read(row.payload),
    callback_payload: cipher.read(row.callbackPayload),
    failure_reason: (row.failureReason as string | null) ?? null,
    submitted_at: asIso(row.submittedAt),
    callback_received_at: asIso(row.callbackReceivedAt),
    superseded_at: asIso(row.supersededAt),
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function mapPaymentIntent(row: PrismaRow): PaymentIntentRecord {
  return {
    id: asNumber(row.id),
    idempotency_key: row.idempotencyKey as string,
    transaction_id: asNullableNumber(row.transactionId),
    status: row.status as string,
    failure_reason: (row.failureReason as string | null) ?? null,
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function mapInvoice(row: PrismaRow): InvoiceRecord {
  return {
    id: asNumber(row.id),
    transaction_id: asNumber(row.transactionId),
    invoice_number: row.invoiceNumber as string,
    invoice_date: invoiceDateToIso(row.invoiceDate),
    due_date: row.dueDate === null || row.dueDate === undefined ? null : invoiceDateToIso(row.dueDate),
    status: row.status as InvoiceRecord['status'],
    customer_name: (row.customerName as string | null) ?? null,
    customer_email: (row.customerEmail as string | null) ?? null,
    customer_city: (row.customerCity as string | null) ?? null,
    customer_address: (row.customerAddress as string | null) ?? null,
    customer_country: (row.customerCountry as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    pdf_path: (row.pdfPath as string | null) ?? null,
    metadata: parseJsonColumn(row.metadata),
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function mapTransactionLog(row: PrismaRow): TransactionLogRecord {
  return {
    id: asNumber(row.id),
    transaction_id: asNumber(row.transactionId),
    source: row.source as string,
    changed_attributes: parseJsonValue<string[]>(row.changedAttributes, []),
    old_values: parseJsonValue<Record<string, unknown> | null>(row.oldValues, null),
    new_values: parseJsonValue<Record<string, unknown> | null>(row.newValues, null),
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function mapBlacklist(row: PrismaRow): BlacklistRecord {
  return {
    id: asNumber(row.id),
    type: row.type as string,
    value: row.value as string,
    reason: (row.reason as string | null) ?? null,
    severity: row.severity as string,
    notes: (row.notes as string | null) ?? null,
    added_by: (row.addedBy as string | null) ?? null,
    expires_at: asIso(row.expiresAt),
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function mapRequestMetadata(row: PrismaRow): RequestMetadataRecord {
  return {
    id: asNumber(row.id),
    transaction_id: asNullableNumber(row.transactionId),
    ip_address: row.ipAddress as string,
    user_agent: (row.userAgent as string | null) ?? null,
    referer: (row.referer as string | null) ?? null,
    country_code: (row.countryCode as string | null) ?? null,
    country_name: (row.countryName as string | null) ?? null,
    region: (row.region as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    latitude: asNullableNumber(row.latitude),
    longitude: asNullableNumber(row.longitude),
    isp: (row.isp as string | null) ?? null,
    device_type: (row.deviceType as string | null) ?? null,
    browser: (row.browser as string | null) ?? null,
    os: (row.os as string | null) ?? null,
    device_fingerprint: (row.deviceFingerprint as string | null) ?? null,
    response_time_ms: asNullableNumber(row.responseTimeMs),
    api_version: (row.apiVersion as string | null) ?? null,
    is_vpn: Boolean(row.isVpn),
    is_proxy: Boolean(row.isProxy),
    is_mobile: Boolean(row.isMobile),
    risk_score: asNumber(row.riskScore),
    risk_reason: (row.riskReason as string | null) ?? null,
    custom_metadata: parseJsonColumn(row.customMetadata),
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

export function unitPriceCents(value: number): bigint {
  return BigInt(Math.round(value * 100));
}

function invoiceDateToIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return (value as T) ?? fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
