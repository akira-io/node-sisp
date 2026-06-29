import type { CredentialsResolver } from '../../../../core/contracts/credentials-resolver';
import type { CallbackPipe } from '../../../../core/contracts/pipes';
import { validateCallbackFingerprint } from '../../../../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../../../infrastructure/fingerprints/token';
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
