import type { TransactionRecord } from '../../database/records';
import type { CallbackPayload } from '../../value-objects/callback-payload';

export class CallbackContext {
  transaction: TransactionRecord | null = null;

  failureReason: string | null = null;

  constructor(readonly payload: CallbackPayload) {}

  requireTransaction(): TransactionRecord {
    if (this.transaction === null) {
      throw new Error('The callback transaction has not been resolved yet.');
    }

    return this.transaction;
  }

  fail(reason: string): this {
    this.failureReason = reason;

    return this;
  }

  failed(): boolean {
    return this.failureReason !== null;
  }
}
