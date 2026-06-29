import { TransactionStatus } from '../../domain/enums/transaction-status';
import { PaymentRetryLimitExceededError } from '../../domain/errors/exceptions';
import type { TransactionRecord } from '../../infrastructure/database/records';
import type { ResolvedSispConfig } from '../config';

export class CanRetryPaymentAction {
  constructor(private readonly config: ResolvedSispConfig) {}

  handle(transaction: TransactionRecord, attemptCount = 1): boolean {
    if (!this.config.allowRetry) {
      return false;
    }

    if (transaction.status !== TransactionStatus.Failed) {
      return false;
    }

    if (this.retryLimitReached(attemptCount)) {
      return false;
    }

    if (this.config.is3DSec !== '1') {
      return true;
    }

    return !this.isMissingRequiredThreeDSecureData(transaction);
  }

  ensureRetryLimit(attemptCount: number): void {
    if (this.retryLimitReached(attemptCount)) {
      throw new PaymentRetryLimitExceededError(this.maxAttempts());
    }
  }

  retryLimitReached(attemptCount: number): boolean {
    return Math.max(0, attemptCount) >= this.maxAttempts();
  }

  private isMissingRequiredThreeDSecureData(transaction: TransactionRecord): boolean {
    return [
      transaction.customer_email,
      transaction.customer_country,
      transaction.customer_city,
      transaction.customer_address,
    ].some((value) => value === null || value === '');
  }

  private maxAttempts(): number {
    return Math.max(1, Math.floor(this.config.retry.maxAttempts));
  }
}
