import type { CallbackOutcome } from '../../../../core/contracts/callback-verifier';
import type { ExpectedPayment } from '../../../../core/contracts/payment-correlation-store';
import type { CallbackRejectionReason } from '../../../../domain/enums/callback-rejection-reason';
import type { CallbackPayload } from '../../../../domain/value-objects/callback-payload';
import { mapTransactionStatus } from '../../../actions/map-transaction-status';

export class StatelessCallbackContext {
  reason: CallbackRejectionReason | null = null;

  expected: ExpectedPayment | null = null;

  constructor(
    readonly payload: CallbackPayload,
    readonly provided: ExpectedPayment | null = null,
  ) {}

  fail(reason: CallbackRejectionReason): this {
    this.reason = reason;

    return this;
  }

  failed(): boolean {
    return this.reason !== null;
  }

  toOutcome(): CallbackOutcome {
    return {
      verified: !this.failed(),
      status: mapTransactionStatus(this.payload.messageType),
      reason: this.reason,
      payload: this.payload,
    };
  }
}
