import { TransactionStatus } from '../enums/transaction-status';

export interface TransactionStatusResponse {
  readonly result: boolean;
  readonly transactionSuccess: boolean;
  readonly transactionStatusDescription: string;
  readonly message: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export function transactionStatusResponseFrom(
  data: Record<string, unknown>,
): TransactionStatusResponse {
  return Object.freeze({
    result: Boolean(data.result ?? false),
    transactionSuccess: Boolean(data.transactionSuccess ?? false),
    transactionStatusDescription: String(data.transactionStatusDescription ?? ''),
    message: String(data.msg ?? ''),
    raw: Object.freeze({ ...data }),
  });
}

export function paymentStatusOf(response: TransactionStatusResponse): TransactionStatus {
  if (!response.result) {
    return TransactionStatus.Pending;
  }

  return response.transactionSuccess ? TransactionStatus.Completed : TransactionStatus.Failed;
}
