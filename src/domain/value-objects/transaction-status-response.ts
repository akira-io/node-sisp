import { TransactionStatus } from '../enums/transaction-status';

export interface TransactionStatusResponse {
  result: boolean;
  transactionSuccess: boolean;
  transactionStatusDescription: string;
  message: string;
  raw: Record<string, unknown>;
}

export function transactionStatusResponseFrom(
  data: Record<string, unknown>,
): TransactionStatusResponse {
  return {
    result: Boolean(data.result ?? false),
    transactionSuccess: Boolean(data.transactionSuccess ?? false),
    transactionStatusDescription: String(data.transactionStatusDescription ?? ''),
    message: String(data.msg ?? ''),
    raw: data,
  };
}

export function paymentStatusOf(response: TransactionStatusResponse): TransactionStatus {
  if (!response.result) {
    return TransactionStatus.Pending;
  }

  return response.transactionSuccess ? TransactionStatus.Completed : TransactionStatus.Failed;
}
