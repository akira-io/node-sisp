export interface CallbackPayload {
  merchantRef: string;
  merchantSession: string;
  timeStamp: string;
  amount: string | number;
  currency: string;
  transactionCode: string;
  transactionID: string | number;
  messageType: string;
  merchantResponse: string;
  responseCode: string;
  fingerprint: string;
  posID: string;
  messageID: string;
  pan: string;
  clearingPeriod: string;
  reference: string;
  entityCode: string;
  clientReceipt: string;
  additionalErrorMessage: string;
  merchantRespCp: string;
  reloadCode: string;
  currencyProvided: boolean;
  transactionCodeProvided: boolean;
  posIDProvided: boolean;
}

export function callbackPayloadFrom(data: Record<string, unknown>): CallbackPayload {
  return {
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
    merchantRespCp: text(data.merchantRespCP),
    reloadCode: text(data.reloadCode),
    currencyProvided: 'currency' in data,
    transactionCodeProvided: 'transactionCode' in data,
    posIDProvided: 'posID' in data,
  };
}

export function callbackPayloadToFormFields(
  payload: CallbackPayload,
): Record<string, string | number> {
  return {
    merchantRespMerchantRef: payload.merchantRef,
    merchantRespMerchantSession: payload.merchantSession,
    merchantRespTimeStamp: payload.timeStamp,
    merchantRespPurchaseAmount: payload.amount,
    currency: payload.currency,
    transactionCode: payload.transactionCode,
    merchantRespTid: payload.transactionID,
    messageType: payload.messageType,
    merchantResp: payload.merchantResponse,
    merchantRespCP: payload.merchantRespCp,
    resultFingerPrint: payload.fingerprint,
    posID: payload.posID,
    merchantRespMessageID: payload.messageID,
    merchantRespPan: payload.pan,
    merchantRespReferenceNumber: payload.reference,
    merchantRespEntityCode: payload.entityCode,
    merchantRespClientReceipt: payload.clientReceipt,
    merchantRespAdditionalErrorMessage: payload.additionalErrorMessage,
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
