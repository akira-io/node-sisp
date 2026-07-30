import type { CredentialsResolver } from '../../../../../core/contracts/credentials-resolver';
import { CallbackRejectionReasons } from '../../../../../domain/enums/callback-rejection-reason';
import { validateCallbackFingerprint } from '../../../../../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../../../../infrastructure/fingerprints/token';
import type { StatelessCallbackContext } from '../stateless-callback-context';
import type { StatelessCallbackPipe } from '../stateless-callback-pipeline';

export class VerifyFingerprint implements StatelessCallbackPipe {
  constructor(private readonly credentialsResolver: CredentialsResolver) {}

  async handle(context: StatelessCallbackContext, next: () => Promise<void>): Promise<void> {
    const token = computeToken(this.credentialsResolver.resolve().posAutCode);

    if (!validateCallbackFingerprint(token, context.payload)) {
      context.fail(CallbackRejectionReasons.InvalidFingerprint);

      return;
    }

    await next();
  }
}
