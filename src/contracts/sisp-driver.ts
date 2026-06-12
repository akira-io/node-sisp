import type { TransactionStatusResponse } from '../value-objects/transaction-status-response';

export interface SispDriver {
  name(): string;
  paymentEndpoint(): string;
  queryTransactionStatus(merchantRef: string): Promise<TransactionStatusResponse>;
}
