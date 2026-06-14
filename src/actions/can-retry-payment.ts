import type { ResolvedSispConfig } from '../config';
import type { TransactionRecord } from '../database/records';
import { TransactionStatus } from '../enums/transaction-status';

export class CanRetryPaymentAction {
  constructor(private readonly config: ResolvedSispConfig) {}

  handle(transaction: TransactionRecord): boolean {
    if (!this.config.allowRetry) {
      return false;
    }

    if (transaction.status !== TransactionStatus.Failed) {
      return false;
    }

    if (this.config.is3DSec !== '1') {
      return true;
    }

    return !this.isMissingRequiredThreeDSecureData(transaction);
  }

  private isMissingRequiredThreeDSecureData(transaction: TransactionRecord): boolean {
    return [
      transaction.customer_email,
      transaction.customer_country,
      transaction.customer_city,
      transaction.customer_address,
    ].some((value) => value === null || value === '');
  }
}
