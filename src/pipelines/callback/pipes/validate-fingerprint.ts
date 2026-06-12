import type { FailTransactionAction } from '../../../actions/fail-transaction';
import type { CredentialsResolver } from '../../../contracts/credentials-resolver';
import type { CallbackPipe } from '../../../contracts/pipes';
import type { SispEventEmitter } from '../../../events';
import { validateCallbackFingerprint } from '../../../fingerprints/callback-fingerprint';
import { computeToken } from '../../../fingerprints/token';
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

    if (!validateCallbackFingerprint(token, context.payload)) {
      context.transaction = await this.failTransaction.handle(
        context.requireTransaction(),
        context.payload,
        INVALID_FINGERPRINT,
      );

      this.events.emit('payment:failed', {
        transaction: context.requireTransaction(),
        payload: context.payload,
      });

      context.fail(INVALID_FINGERPRINT);

      return;
    }

    await next();
  }
}
