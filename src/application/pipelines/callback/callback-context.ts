import type { CallbackPayload } from '../../../domain/value-objects/callback-payload';
import type {
  TransactionAttemptRecord,
  TransactionRecord,
} from '../../../infrastructure/database/records';

export class CallbackContext {
  transaction: TransactionRecord | null = null;

  attempt: TransactionAttemptRecord | null = null;

  failureReason: string | null = null;

  transactionStatusPropagated = true;

  constructor(readonly payload: CallbackPayload) {}

  requireTransaction(): TransactionRecord {
    if (this.transaction === null) {
      throw new Error('The callback transaction has not been resolved yet.');
    }

    return this.transaction;
  }

  requireAttempt(): TransactionAttemptRecord {
    if (this.attempt === null) {
      throw new Error('The callback transaction attempt has not been resolved yet.');
    }

    return this.attempt;
  }

  fail(reason: string): this {
    this.failureReason = reason;

    return this;
  }

  failed(): boolean {
    return this.failureReason !== null;
  }
}
