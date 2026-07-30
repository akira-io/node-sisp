import type { CallbackOutcome } from '../../../../core/contracts/callback-verifier';
import type { CorrelatedPayment } from '../../../../core/contracts/payment-correlation-store';
import type { CallbackRejectionReason } from '../../../../domain/enums/callback-rejection-reason';
import type { CallbackPayload } from '../../../../domain/value-objects/callback-payload';

export class StatelessCallbackContext {
  reason: CallbackRejectionReason | null = null;

  expected: CorrelatedPayment | null = null;

  constructor(readonly payload: CallbackPayload) {}

  fail(reason: CallbackRejectionReason): this {
    this.reason = reason;

    return this;
  }

  failed(): boolean {
    return this.reason !== null;
  }

  toOutcome(): CallbackOutcome {
    return { verified: !this.failed(), reason: this.reason, payload: this.payload };
  }
}
