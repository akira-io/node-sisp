export interface PaymentRequest {
  readonly posID: string;
  readonly merchantRef: string;
  readonly merchantSession: string;
  readonly amount: number;
  readonly currency: string;
  readonly is3DSec: string;
  readonly urlMerchantResponse: string;
  readonly languageMessages: string;
  readonly timeStamp: string;
  readonly fingerprintversion: string;
  readonly transactionCode: string;
  readonly fingerprint: string;
  readonly token: string;
  readonly entityCode: string;
  readonly referenceNumber: string;
  readonly locale: string;
  readonly purchaseRequest: string;
}

export function paymentRequestToFormFields(
  request: PaymentRequest,
): Record<string, string | number> {
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
