import type { PaymentRequest } from '../../../domain/value-objects/payment-request';
import type { PaymentRequestData } from '../../../domain/value-objects/payment-request-data';
import type { HttpRequestInfo } from '../../../infrastructure/http/request-info';
import type { TransactionRecord } from '../../../infrastructure/storage/knex/records';

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
