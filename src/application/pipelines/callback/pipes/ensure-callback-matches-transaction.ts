import type { CredentialsResolver } from '../../../../core/contracts/credentials-resolver';
import type { CallbackPipe } from '../../../../core/contracts/pipes';
import { CallbackRejectionReasons } from '../../../../domain/enums/callback-rejection-reason';
import type { CallbackPayload } from '../../../../domain/value-objects/callback-payload';
import type {
  TransactionAttemptRecord,
  TransactionRecord,
} from '../../../../infrastructure/storage/knex/records';
import { toThousandths } from '../../../../support/sisp-amount';
import type { FailTransactionAction } from '../../../actions/fail-transaction';
import type { ResolvedSispConfig } from '../../../config';
import type { SispEventEmitter } from '../../../events';
import type { CallbackContext } from '../callback-context';

export class EnsureCallbackMatchesTransaction implements CallbackPipe {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly credentialsResolver: CredentialsResolver,
    private readonly failTransaction: FailTransactionAction,
    private readonly events: SispEventEmitter,
  ) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    if (
      !this.matchesTransaction(
        context.requireTransaction(),
        context.requireAttempt(),
        context.payload,
      )
    ) {
      const failed = await this.failTransaction.handle(
        context.requireTransaction(),
        context.payload,
        CallbackRejectionReasons.DetailsMismatch,
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

      context.fail(CallbackRejectionReasons.DetailsMismatch);

      return;
    }

    await next();
  }

  private matchesTransaction(
    transaction: TransactionRecord,
    attempt: TransactionAttemptRecord,
    payload: CallbackPayload,
  ): boolean {
    return (
      attempt.merchant_ref === payload.merchantRef &&
      attempt.merchant_session === payload.merchantSession &&
      toThousandths(transaction.amount) === toThousandths(payload.amount) &&
      (!payload.currencyProvided || transaction.currency === payload.currency) &&
      (!payload.transactionCodeProvided ||
        this.transactionCode(transaction) === payload.transactionCode) &&
      (!payload.posIDProvided || this.credentialsResolver.resolve().posId === payload.posID)
    );
  }

  private transactionCode(transaction: TransactionRecord): string {
    const transactionCode = transaction.transaction_code ?? '';

    return transactionCode === '' ? this.config.transactionCode : transactionCode;
  }
}
