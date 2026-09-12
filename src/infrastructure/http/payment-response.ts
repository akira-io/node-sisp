import { isErrorMessageType } from '../../domain/enums/message-type';
import type {
  InvoiceRecord,
  TransactionAttemptRecord,
  TransactionRecord,
} from '../storage/knex/records';

export interface PaymentResponseData {
  transaction: {
    id: number;
    status: string;
    amount: number;
    formatted_amount: string;
    currency: string;
    merchant_ref: string;
    message_type: string | null;
  };
  error: PaymentErrorData | null;
  allowRetry: boolean;
  retryUrl: string | null;
  invoice: {
    invoice_number: string;
    invoice_date: string;
    status: string;
    pdf_path: string | null;
  } | null;
}

export interface PaymentErrorData {
  code: string;
  description: string;
  detail: string;
  customerMessage: string;
}

export interface RetryAvailability {
  allowed: boolean;
  url: string | null;
}

export function paymentResponseData(
  transaction: TransactionRecord,
  invoice: InvoiceRecord | null,
  retry: RetryAvailability = { allowed: false, url: null },
  attempt: TransactionAttemptRecord | null = null,
): PaymentResponseData {
  return {
    transaction: {
      id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      formatted_amount: formatAmountEcv(transaction.amount),
      currency: transaction.currency,
      merchant_ref: transaction.merchant_ref,
      message_type: transaction.message_type,
    },
    error: callbackErrorFrom(attempt),
    allowRetry: retry.allowed,
    retryUrl: retry.url,
    invoice: invoice
      ? {
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          status: invoice.status,
          pdf_path: invoice.pdf_path,
        }
      : null,
  };
}

export function formatAmountEcv(amount: number): string {
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formatted} ECV`;
}

export interface CallbackErrorFields {
  messageType: string;
  errorCode: string;
  errorDescription: string;
  errorDetail: string;
  additionalErrorMessage: string;
}

export function structuredErrorFrom(payload: CallbackErrorFields): PaymentErrorData | null {
  if (!isErrorMessageType(payload.messageType) && payload.additionalErrorMessage === '') {
    return null;
  }

  return {
    code: payload.errorCode,
    description: payload.errorDescription,
    detail: payload.errorDetail,
    customerMessage: payload.additionalErrorMessage,
  };
}

export function callbackErrorFrom(
  attempt: TransactionAttemptRecord | null,
): PaymentErrorData | null {
  const stored = attempt?.callback_payload;

  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return null;
  }

  const fields = stored as Record<string, unknown>;

  return structuredErrorFrom({
    messageType: string(fields.messageType),
    errorCode: string(fields.errorCode),
    errorDescription: string(fields.errorDescription),
    errorDetail: string(fields.errorDetail),
    additionalErrorMessage: string(fields.additionalErrorMessage),
  });
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
