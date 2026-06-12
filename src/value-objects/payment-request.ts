export interface PaymentRequest {
  posID: string;
  merchantRef: string;
  merchantSession: string;
  amount: number;
  currency: string;
  is3DSec: string;
  urlMerchantResponse: string;
  languageMessages: string;
  timeStamp: string;
  fingerprintversion: string;
  transactionCode: string;
  fingerprint: string;
  token: string;
  entityCode: string;
  referenceNumber: string;
  locale: string;
  purchaseRequest: string;
}

export function paymentRequestToFormFields(request: PaymentRequest): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    posID: request.posID,
    merchantRef: request.merchantRef,
    merchantSession: request.merchantSession,
    amount: request.amount,
    currency: request.currency,
    is3DSec: request.is3DSec,
    urlMerchantResponse: request.urlMerchantResponse,
    languageMessages: request.languageMessages,
    timeStamp: request.timeStamp,
    fingerprintversion: request.fingerprintversion,
    transactionCode: request.transactionCode,
    fingerprint: request.fingerprint,
    token: request.token,
    entityCode: request.entityCode,
    referenceNumber: request.referenceNumber,
    locale: request.locale,
  };

  if (request.purchaseRequest !== '') {
    fields.purchaseRequest = request.purchaseRequest;
  }

  return fields;
}
