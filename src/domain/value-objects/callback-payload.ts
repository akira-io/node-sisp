export interface CallbackPayload {
  readonly merchantRef: string;
  readonly merchantSession: string;
  readonly timeStamp: string;
  readonly amount: string | number;
  readonly currency: string;
  readonly transactionCode: string;
  readonly transactionID: string | number;
  readonly messageType: string;
  readonly merchantResponse: string;
  readonly responseCode: string;
  readonly fingerprint: string;
  readonly posID: string;
  readonly messageID: string;
  readonly pan: string;
  readonly clearingPeriod: string;
  readonly reference: string;
  readonly entityCode: string;
  readonly clientReceipt: string;
  readonly additionalErrorMessage: string;
  readonly errorCode: string;
  readonly errorDetail: string;
  readonly errorDescription: string;
  readonly screenError: string;
  readonly fingerprintVersion: string;
  readonly merchantRespCp: string;
  readonly reloadCode: string;
  readonly amountProvided: boolean;
  readonly currencyProvided: boolean;
  readonly transactionCodeProvided: boolean;
  readonly posIDProvided: boolean;
}

export function callbackPayloadFrom(data: Record<string, unknown>): CallbackPayload {
  return Object.freeze({
    merchantRef: text(data.merchantRespMerchantRef),
    merchantSession: text(data.merchantRespMerchantSession),
    timeStamp: text(data.merchantRespTimeStamp),
    amount: scalar(data.merchantRespPurchaseAmount) ?? 0,
    currency: text(data.currency),
    transactionCode: text(data.transactionCode),
    transactionID: scalar(data.merchantRespTid) ?? '',
    messageType: text(data.messageType),
    merchantResponse: text(data.merchantResp),
    responseCode: text(data.merchantRespCP),
    fingerprint: text(data.resultFingerPrint),
    posID: text(data.posID),
    messageID: text(data.merchantRespMessageID),
    pan: text(data.merchantRespPan),
    clearingPeriod: text(data.merchantRespCP),
    reference: text(data.merchantRespReferenceNumber),
    entityCode: text(data.merchantRespEntityCode),
    clientReceipt: text(data.merchantRespClientReceipt),
    additionalErrorMessage: text(data.merchantRespAdditionalErrorMessage),
    errorCode: text(data.merchantRespErrorCode),
    errorDetail: text(data.merchantRespErrorDetail),
    errorDescription: text(data.merchantRespErrorDescription),
    screenError: text(data.merchantRespScreenError),
    fingerprintVersion: text(data.resultFingerPrintVersion),
    merchantRespCp: text(data.merchantRespCP),
    reloadCode: text(data.reloadCode),
    amountProvided: 'merchantRespPurchaseAmount' in data,
    currencyProvided: 'currency' in data,
    transactionCodeProvided: 'transactionCode' in data,
    posIDProvided: 'posID' in data,
  });
}

export function callbackPayloadToFormFields(
  payload: CallbackPayload,
): Record<string, string | number> {
  return {
    ...(payload.amountProvided ? { merchantRespPurchaseAmount: payload.amount } : {}),
    ...(payload.currencyProvided ? { currency: payload.currency } : {}),
    ...(payload.transactionCodeProvided ? { transactionCode: payload.transactionCode } : {}),
    ...(payload.posIDProvided ? { posID: payload.posID } : {}),
    merchantRespMerchantRef: payload.merchantRef,
    merchantRespMerchantSession: payload.merchantSession,
    merchantRespTimeStamp: payload.timeStamp,
    merchantRespTid: payload.transactionID,
    messageType: payload.messageType,
    merchantResp: payload.merchantResponse,
    merchantRespCP: payload.merchantRespCp,
    resultFingerPrint: payload.fingerprint,
    merchantRespMessageID: payload.messageID,
    merchantRespPan: payload.pan,
    merchantRespReferenceNumber: payload.reference,
    merchantRespEntityCode: payload.entityCode,
    merchantRespClientReceipt: payload.clientReceipt,
    merchantRespAdditionalErrorMessage: payload.additionalErrorMessage,
    merchantRespErrorCode: payload.errorCode,
    merchantRespErrorDetail: payload.errorDetail,
    merchantRespErrorDescription: payload.errorDescription,
    merchantRespScreenError: payload.screenError,
    resultFingerPrintVersion: payload.fingerprintVersion,
    reloadCode: payload.reloadCode,
  };
}

function text(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '';
}

function scalar(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  return null;
}
