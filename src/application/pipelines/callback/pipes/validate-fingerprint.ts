import type { CredentialsResolver } from '../../../../core/contracts/credentials-resolver';
import type { CallbackPipe } from '../../../../core/contracts/pipes';
import { validateCallbackFingerprint } from '../../../../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../../../infrastructure/fingerprints/token';
import type { FailTransactionAction } from '../../../actions/fail-transaction';
import type { SispEventEmitter } from '../../../events';
import type { CallbackContext } from '../callback-context';

const INVALID_FINGERPRINT = 'invalid_callback_fingerprint';

export class ValidateFingerprint implements CallbackPipe {
  constructor(
    private readonly credentialsResolver: CredentialsResolver,
    private readonly failTransaction: FailTransactionAction,
    private readonly events: SispEventEmitter,
  ) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const token = computeToken(this.credentialsResolver.resolve().posAutCode);

    if (validateCallbackFingerprint(token, context.payload)) {
      await next();

      return;
    }

    const failed = await this.failTransaction.handle(
      context.requireTransaction(),
      context.payload,
      INVALID_FINGERPRINT,
      context.requireAttempt(),
    );
    context.transactionStatusPropagated = failed.propagated;
    context.transaction = failed.transaction;

    if (failed.propagated) {
      this.events.emit('payment:failed', {
        transaction: context.requireTransaction(),
        payload: context.payload,
      });
    }

    context.fail(INVALID_FINGERPRINT);
  }
}
