import type { CredentialsResolver } from '../../../../../core/contracts/credentials-resolver';
import type {
  ExpectedPayment,
  ExpectedPaymentResolver,
  PaymentCorrelationStore,
} from '../../../../../core/contracts/payment-correlation-store';
import { CallbackRejectionReasons } from '../../../../../domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../../../../../domain/enums/transaction-status';
import type { CallbackPayload } from '../../../../../domain/value-objects/callback-payload';
import { toThousandths } from '../../../../../support/sisp-amount';
import { mapTransactionStatus } from '../../../../actions/map-transaction-status';
import type { StatelessCallbackContext } from '../stateless-callback-context';
import type { StatelessCallbackPipe } from '../stateless-callback-pipeline';

export class MatchExpectedPayment implements StatelessCallbackPipe {
  constructor(
    private readonly correlation: PaymentCorrelationStore | null,
    private readonly credentialsResolver: CredentialsResolver,
    private readonly expectedPayment: ExpectedPaymentResolver | null = null,
  ) {}

  async handle(context: StatelessCallbackContext, next: () => Promise<void>): Promise<void> {
    if (this.correlation === null) {
      await this.matchWithoutCorrelation(context, next);

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

  private async matchWithoutCorrelation(
    context: StatelessCallbackContext,
    next: () => Promise<void>,
  ): Promise<void> {
    const expected = context.provided ?? (await this.expectedPayment?.(context.payload)) ?? null;

    if (expected === null) {
      if (mapTransactionStatus(context.payload.messageType) === TransactionStatus.Completed) {
        context.fail(CallbackRejectionReasons.ExpectedPaymentMissing);

        return;
      }

      await next();

      return;
    }

    context.expected = expected;

    if (this.matches(expected, context.payload)) {
      await next();
    } else {
      context.fail(CallbackRejectionReasons.DetailsMismatch);
    }
  }

  private matches(expected: ExpectedPayment, payload: CallbackPayload): boolean {
    const expectedThousandths = safeThousandths(expected.amount);

    return (
      expectedThousandths !== null &&
      (!payload.amountProvided || expectedThousandths === toThousandths(payload.amount)) &&
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
