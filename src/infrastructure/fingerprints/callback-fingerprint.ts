import { isErrorMessageType } from '../../domain/enums/message-type';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';
import { toThousandths } from '../../support/sisp-amount';
import { constantTimeEquals, sha512Base64 } from './hash';

export function generateCallbackFingerprint(token: string, payload: CallbackPayload): string {
  const fields = isErrorMessageType(payload.messageType)
    ? errorFields(token, payload)
    : successFields(token, payload);

  return sha512Base64(fields.join(''));
}

export function validateCallbackFingerprint(token: string, payload: CallbackPayload): boolean {
  let expected: string;

  try {
    expected = generateCallbackFingerprint(token, payload);
  } catch {
    return false;
  }

  return constantTimeEquals(expected, payload.fingerprint);
}

function successFields(token: string, payload: CallbackPayload): string[] {
  return [
    token,
    payload.messageType,
    payload.clearingPeriod,
    String(payload.transactionID),
    payload.merchantRef,
    payload.merchantSession,
    String(toThousandths(payload.amount)),
    payload.messageID,
    payload.pan,
    payload.merchantResponse,
    payload.timeStamp,
    payload.reference,
    payload.entityCode,
    payload.clientReceipt,
    payload.additionalErrorMessage,
    payload.reloadCode,
  ];
}

function errorFields(token: string, payload: CallbackPayload): string[] {
  return [
    token,
    payload.messageType,
    payload.messageID,
    payload.errorCode,
    payload.errorDetail,
    payload.errorDescription,
    payload.merchantRef,
    payload.merchantSession,
    payload.additionalErrorMessage,
    payload.timeStamp,
  ];
}
