import type { CredentialsResolver } from '../../../../../core/contracts/credentials-resolver';
import type {
  CorrelatedPayment,
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

    const expected = await this.correlation.find(
      context.payload.merchantRef,
      context.payload.merchantSession,
    );

    if (expected === null) {
      context.fail(CallbackRejectionReasons.UnknownTransaction);

      return;
    }

    if (expected.processedAt !== null && expected.processedAt !== undefined) {
      context.fail(CallbackRejectionReasons.Replayed);

      return;
    }

    context.expected = expected;

    if (!this.matches(expected, context.payload)) {
      context.fail(CallbackRejectionReasons.DetailsMismatch);
    } else {
      await next();
    }

    await this.correlation.markProcessed(
      context.payload.merchantRef,
      context.payload.merchantSession,
      context.toOutcome(),
    );
  }

  private matches(expected: CorrelatedPayment, payload: CallbackPayload): boolean {
    return (
      toThousandths(expected.amount) === toThousandths(payload.amount) &&
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
