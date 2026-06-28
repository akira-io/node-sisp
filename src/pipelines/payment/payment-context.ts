import type { TransactionRecord } from '../../database/records';
import type { HttpRequestInfo } from '../../http/request-info';
import type { PaymentRequest } from '../../value-objects/payment-request';
import type { PaymentRequestData } from '../../value-objects/payment-request-data';

export class PaymentContext {
  paymentRequest: PaymentRequest | null = null;

  transaction: TransactionRecord | null = null;

  private preflightCompleted = false;

  constructor(
    readonly data: PaymentRequestData,
    readonly request: HttpRequestInfo,
  ) {}

  requirePaymentRequest(): PaymentRequest {
    if (this.paymentRequest === null) {
      throw new Error('The payment request has not been built yet.');
    }

    return this.paymentRequest;
  }

  requireTransaction(): TransactionRecord {
    if (this.transaction === null) {
      throw new Error('The transaction has not been persisted yet.');
    }

    return this.transaction;
  }

  markPreflightCompleted(): void {
    this.preflightCompleted = true;
  }

  hasCompletedPreflight(): boolean {
    return this.preflightCompleted;
  }
}
