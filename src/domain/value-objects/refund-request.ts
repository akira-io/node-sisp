export interface RefundRequest {
  readonly posID: string;
  readonly merchantRef: string;
  readonly merchantSession: string;
  readonly amount: number;
  readonly currency: string;
  readonly timeStamp: string;
  readonly fingerprintversion: string;
  readonly transactionCode: string;
  readonly fingerprint: string;
  readonly reversal: string;
  readonly clearingPeriod: string;
  readonly transactionID: string;
}

export function refundRequestToRecord(request: RefundRequest): Record<string, string | number> {
  return {
    posID: request.posID,
    merchantRef: request.merchantRef,
    merchantSession: request.merchantSession,
    amount: request.amount,
    currency: request.currency,
    timeStamp: request.timeStamp,
    fingerprintversion: request.fingerprintversion,
    transactionCode: request.transactionCode,
    fingerprint: request.fingerprint,
    reversal: request.reversal,
    clearingPeriod: request.clearingPeriod,
    transactionID: request.transactionID,
  };
}
