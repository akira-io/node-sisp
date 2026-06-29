export interface RefundRequest {
  posID: string;
  merchantRef: string;
  merchantSession: string;
  amount: number;
  currency: string;
  timeStamp: string;
  fingerprintversion: string;
  transactionCode: string;
  fingerprint: string;
  reversal: string;
  clearingPeriod: string;
  transactionID: string;
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
