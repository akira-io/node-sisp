import type { CredentialsResolver } from '../../../../../core/contracts/credentials-resolver';
import type {
  ExpectedPayment,
  PaymentCorrelationStore,
} from '../../../../../core/contracts/payment-correlation-store';
import { CallbackRejectionReasons } from '../../../../../domain/enums/callback-rejection-reason';
import type { CallbackPayload } from '../../../../../domain/value-objects/callback-payload';
import { toThousandths } from '../../../../../support/sisp-amount';
import type { StatelessCallbackContext } from '../stateless-callback-context';
import type { StatelessCallbackPipe } from '../stateless-callback-pipeline';

export class MatchExpectedPayment implements StatelessCallbackPipe {
  constructor(
    private readonly correlation: PaymentCorrelationStore | null,
    private readonly credentialsResolver: CredentialsResolver,
  ) {}

  async handle(context: StatelessCallbackContext, next: () => Promise<void>): Promise<void> {
    if (this.correlation === null) {
      await next();

      return;
    }

    const claim = await this.correlation.claim(
      context.payload.merchantRef,
      context.payload.merchantSession,
    );

    if (claim.status === 'missing') {
      context.fail(CallbackRejectionReasons.UnknownTransaction);

      return;
    }

    if (claim.status === 'already_processed') {
      context.fail(CallbackRejectionReasons.Replayed);

      return;
    }

    context.expected = claim.payment;

    if (this.matches(claim.payment, context.payload)) {
      await next();
    } else {
      context.fail(CallbackRejectionReasons.DetailsMismatch);
    }

    await this.correlation.markProcessed(
      context.payload.merchantRef,
      context.payload.merchantSession,
      context.toOutcome(),
    );
  }

  private matches(expected: ExpectedPayment, payload: CallbackPayload): boolean {
    const expectedThousandths = safeThousandths(expected.amount);

    return (
      expectedThousandths !== null &&
      expectedThousandths === toThousandths(payload.amount) &&
      (!payload.currencyProvided ||
        expected.currency === undefined ||
        expected.currency === payload.currency) &&
      (!payload.transactionCodeProvided ||
        expected.transactionCode === undefined ||
        expected.transactionCode === payload.transactionCode) &&
      (!payload.posIDProvided || this.credentialsResolver.resolve().posId === payload.posID)
    );
  }
}

function safeThousandths(amount: unknown): number | null {
  if (typeof amount !== 'string' && typeof amount !== 'number') {
    return null;
  }

  try {
    return toThousandths(amount);
  } catch {
    return null;
  }
}
