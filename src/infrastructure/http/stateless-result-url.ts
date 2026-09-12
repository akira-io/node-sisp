import {
  type CallbackRejectionReason,
  isCallbackRejectionReason,
} from '../../domain/enums/callback-rejection-reason';
import { isTransactionStatus, type TransactionStatus } from '../../domain/enums/transaction-status';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';
import type { UrlSigner } from '../../support/signed-url';
import { type PaymentErrorData, structuredErrorFrom } from './payment-response';

const RESULT_URL_TTL_MINUTES = 5;

export interface StatelessPaymentResponseData {
  merchant_ref: string;
  verified: boolean;
  status: TransactionStatus | null;
  reason: CallbackRejectionReason | null;
  error: PaymentErrorData | null;
}

export function statelessResultData(
  payload: CallbackPayload,
  status: TransactionStatus | null,
  reason: CallbackRejectionReason | null,
): StatelessPaymentResponseData {
  return {
    merchant_ref: payload.merchantRef,
    verified: reason === null,
    status,
    reason,
    error: reason === null ? structuredErrorFrom(payload) : null,
  };
}

export function signStatelessResult(
  signer: UrlSigner,
  path: string,
  data: StatelessPaymentResponseData,
): string {
  const params: Record<string, string> = {
    ref: data.merchant_ref,
    verified: data.verified ? '1' : '0',
    hasError: data.error === null ? '0' : '1',
    errorCode: data.error?.code ?? '',
    errorMessage: data.error?.customerMessage ?? '',
  };

  if (data.status !== null) {
    params.status = data.status;
  }

  if (data.reason !== null) {
    params.reason = data.reason;
  }

  return signer.sign(path, params, new Date(Date.now() + RESULT_URL_TTL_MINUTES * 60_000));
}

export function readStatelessResult(
  signer: UrlSigner,
  path: string,
  query: Record<string, unknown>,
): StatelessPaymentResponseData | null {
  if (!signer.validate(path, query)) {
    return null;
  }

  const reason = query.reason;

  if (reason !== undefined && !isCallbackRejectionReason(reason)) {
    return null;
  }

  if (query.status !== undefined && !isTransactionStatus(query.status)) {
    return null;
  }

  return {
    merchant_ref: typeof query.ref === 'string' ? query.ref : '',
    verified: query.verified === '1',
    status: query.status === undefined ? null : query.status,
    reason: reason === undefined ? null : reason,
    error: query.hasError === '1' ? carriedError(query) : null,
  };
}

function carriedError(query: Record<string, unknown>): PaymentErrorData {
  return {
    code: typeof query.errorCode === 'string' ? query.errorCode : '',
    description: '',
    detail: '',
    customerMessage: typeof query.errorMessage === 'string' ? query.errorMessage : '',
  };
}
