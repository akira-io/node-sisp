import type { CredentialsResolver } from '../../../../core/contracts/credentials-resolver';
import type { CallbackPipe } from '../../../../core/contracts/pipes';
import { CallbackRejectionReasons } from '../../../../domain/enums/callback-rejection-reason';
import { validateCallbackFingerprint } from '../../../../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../../../infrastructure/fingerprints/token';
import type { CallbackContext } from '../callback-context';

export class ValidateFingerprint implements CallbackPipe {
  constructor(private readonly credentialsResolver: CredentialsResolver) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const token = computeToken(this.credentialsResolver.resolve().posAutCode);

    if (validateCallbackFingerprint(token, context.payload)) {
      await next();

      return;
    }

    context.transactionStatusPropagated = false;
    context.fail(CallbackRejectionReasons.InvalidFingerprint);
  }
}
