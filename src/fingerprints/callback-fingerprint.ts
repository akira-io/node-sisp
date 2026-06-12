import { toThousandths } from '../support/sisp-amount';
import type { CallbackPayload } from '../value-objects/callback-payload';
import { constantTimeEquals, sha512Base64 } from './hash';

export function generateCallbackFingerprint(token: string, payload: CallbackPayload): string {
  const fields = [
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

  return sha512Base64(fields.join(''));
}

export function validateCallbackFingerprint(token: string, payload: CallbackPayload): boolean {
  return constantTimeEquals(generateCallbackFingerprint(token, payload), payload.fingerprint);
}
