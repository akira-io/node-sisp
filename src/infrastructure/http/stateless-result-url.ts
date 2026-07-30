import {
  type CallbackRejectionReason,
  isCallbackRejectionReason,
} from '../../domain/enums/callback-rejection-reason';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';
import type { UrlSigner } from '../../support/signed-url';
import { type PaymentErrorData, structuredErrorFrom } from './payment-response';

const RESULT_URL_TTL_MINUTES = 5;

export interface StatelessPaymentResponseData {
  merchant_ref: string;
  verified: boolean;
  reason: CallbackRejectionReason | null;
  error: PaymentErrorData | null;
}

export function statelessResultData(
  payload: CallbackPayload,
  reason: CallbackRejectionReason | null,
  language: string,
): StatelessPaymentResponseData {
  return {
    merchant_ref: payload.merchantRef,
    verified: reason === null,
    reason,
    error: structuredErrorFrom(payload.messageType, language),
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
    messageType: data.error?.code ?? '',
  };

  if (data.reason !== null) {
    params.reason = data.reason;
  }

  return signer.sign(path, params, new Date(Date.now() + RESULT_URL_TTL_MINUTES * 60_000));
}

export function readStatelessResult(
  signer: UrlSigner,
  path: string,
  query: Record<string, unknown>,
  language = 'pt',
): StatelessPaymentResponseData | null {
  if (!signer.validate(path, query)) {
    return null;
  }

  const reason = query.reason;

  if (reason !== undefined && !isCallbackRejectionReason(reason)) {
    return null;
  }

  const messageType = typeof query.messageType === 'string' ? query.messageType : '';

  return {
    merchant_ref: typeof query.ref === 'string' ? query.ref : '',
    verified: query.verified === '1',
    reason: reason === undefined ? null : reason,
    error: structuredErrorFrom(messageType, language),
  };
}
