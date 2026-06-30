import {
  errorActionLabel,
  errorCategoryLabel,
  errorMessageTypeFromValue,
  errorMessageTypeLabel,
} from '../../domain/enums/error-message-type';
import type { InvoiceRecord, TransactionRecord } from '../storage/knex/records';

export interface PaymentResponseData {
  transaction: {
    id: number;
    status: string;
    amount: number;
    formatted_amount: string;
    currency: string;
    merchant_ref: string;
    merchant_session: string;
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
  label: string;
  category: string;
  categoryLabel: string;
  action: string;
  actionLabel: string;
}

export interface RetryAvailability {
  allowed: boolean;
  url: string | null;
}

export function paymentResponseData(
  transaction: TransactionRecord,
  invoice: InvoiceRecord | null,
  retry: RetryAvailability = { allowed: false, url: null },
): PaymentResponseData {
  return {
    transaction: {
      id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      formatted_amount: formatAmountEcv(transaction.amount),
      currency: transaction.currency,
      merchant_ref: transaction.merchant_ref,
      merchant_session: transaction.merchant_session,
      message_type: transaction.message_type,
    },
    error: structuredError(transaction),
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

function structuredError(transaction: TransactionRecord): PaymentErrorData | null {
  if (!transaction.message_type) {
    return null;
  }

  const errorType = errorMessageTypeFromValue(transaction.message_type);

  if (errorType === null) {
    return null;
  }

  const language = transaction.locale.slice(0, 2);

  return {
    code: errorType.value,
    label: errorMessageTypeLabel(errorType, language),
    category: errorType.category,
    categoryLabel: errorCategoryLabel(errorType, language),
    action: errorType.action,
    actionLabel: errorActionLabel(errorType, language),
  };
}
