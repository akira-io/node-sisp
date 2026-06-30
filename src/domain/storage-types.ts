import type { TransactionStatus } from './enums/transaction-status';
import type { RequestMetadataRecord } from './records';

export interface ListByTransactionOptions {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface ListTransactionsOptions extends ListByTransactionOptions {
  status?: TransactionStatus;
}

export interface NewTransaction {
  merchantRef: string;
  merchantSession: string;
  amount: number | string;
  currency?: string;
  transactionCode?: string;
  payload?: unknown;
  locale?: string | null;
}

export interface TransactionChanges {
  amount?: number | string;
  status?: TransactionStatus;
  transaction_id?: string | null;
  message_type?: string | null;
  response_code?: string | null;
  merchant_response?: string | null;
  fingerprint?: string | null;
  payload?: unknown;
  merchant_session?: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_country?: string | null;
  customer_city?: string | null;
  customer_address?: string | null;
  customer_postal_code?: string | null;
  locale?: string;
  cancelled_at?: string | null;
  refunded_at?: string | null;
}

export interface TransactionAttemptChanges {
  status: TransactionStatus;
  gateway_transaction_id?: string | null;
  message_type?: string | null;
  response_code?: string | null;
  merchant_response?: string | null;
  fingerprint?: string | null;
  callback_payload?: unknown;
  failure_reason?: string | null;
  callback_received_at?: string | null;
}

export interface BlacklistEntry {
  type: string;
  value: string;
  severity?: string;
  reason?: string | null;
  notes?: string | null;
  addedBy?: string | null;
  expiresInMinutes?: number | null;
}

export interface RateLimitHit {
  identifier: string;
  limitType: string;
  context?: string | null;
  limit: number;
  windowSeconds: number;
}

export type NewRequestMetadata = Omit<
  Partial<RequestMetadataRecord>,
  'id' | 'created_at' | 'updated_at'
> &
  Pick<RequestMetadataRecord, 'ip_address'>;
