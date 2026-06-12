import type { InvoiceStatus } from '../enums/invoice-status';
import type { TransactionStatus } from '../enums/transaction-status';

export interface TransactionRecord {
  id: number;
  merchant_ref: string;
  merchant_session: string;
  amount: number;
  amount_cents: number;
  currency: string;
  status: TransactionStatus;
  transaction_code: string | null;
  transaction_id: string | null;
  message_type: string | null;
  response_code: string | null;
  merchant_response: string | null;
  fingerprint: string | null;
  payload: unknown;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_country: string | null;
  customer_city: string | null;
  customer_address: string | null;
  customer_postal_code: string | null;
  locale: string;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TransactionItemRecord {
  id: number;
  transaction_id: number;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  description: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface InvoiceRecord {
  id: number;
  transaction_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  customer_address: string | null;
  customer_country: string | null;
  notes: string | null;
  pdf_path: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface TransactionLogRecord {
  id: number;
  transaction_id: number;
  source: string;
  changed_attributes: string[];
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RequestMetadataRecord {
  id: number;
  transaction_id: number | null;
  ip_address: string;
  user_agent: string | null;
  referer: string | null;
  country_code: string | null;
  country_name: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  device_fingerprint: string | null;
  response_time_ms: number | null;
  api_version: string | null;
  is_vpn: boolean;
  is_proxy: boolean;
  is_mobile: boolean;
  risk_score: number;
  risk_reason: string | null;
  custom_metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface BlacklistRecord {
  id: number;
  type: string;
  value: string;
  reason: string | null;
  severity: string;
  notes: string | null;
  added_by: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function transactionPayloadRecord(transaction: TransactionRecord): Record<string, unknown> {
  const payload = transaction.payload;

  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
}
