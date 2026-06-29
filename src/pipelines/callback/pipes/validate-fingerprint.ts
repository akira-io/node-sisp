import type { CredentialsResolver } from '../../../contracts/credentials-resolver';
import type { CallbackPipe } from '../../../contracts/pipes';
import { validateCallbackFingerprint } from '../../../fingerprints/callback-fingerprint';
import { computeToken } from '../../../fingerprints/token';
import type { CallbackContext } from '../callback-context';

const INVALID_FINGERPRINT = 'invalid_callback_fingerprint';

export class ValidateFingerprint implements CallbackPipe {
  constructor(private readonly credentialsResolver: CredentialsResolver) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const token = computeToken(this.credentialsResolver.resolve().posAutCode);

    if (!validateCallbackFingerprint(token, context.payload)) {
      context.transactionStatusPropagated = false;
      context.fail(INVALID_FINGERPRINT);

      return;
    }

    await next();
  }
}
