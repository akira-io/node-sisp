import type { FailTransactionAction } from '../../../actions/fail-transaction';
import type { ResolvedSispConfig } from '../../../config';
import type { CredentialsResolver } from '../../../contracts/credentials-resolver';
import type { CallbackPipe } from '../../../contracts/pipes';
import type { TransactionRecord } from '../../../database/records';
import type { SispEventEmitter } from '../../../events';
import { toThousandths } from '../../../support/sisp-amount';
import type { CallbackPayload } from '../../../value-objects/callback-payload';
import type { CallbackContext } from '../callback-context';

const DETAILS_MISMATCH = 'callback_details_mismatch';

export class EnsureCallbackMatchesTransaction implements CallbackPipe {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly credentialsResolver: CredentialsResolver,
    private readonly failTransaction: FailTransactionAction,
    private readonly events: SispEventEmitter,
  ) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    if (!this.matchesTransaction(context.requireTransaction(), context.payload)) {
      context.transaction = await this.failTransaction.handle(
        context.requireTransaction(),
        context.payload,
        DETAILS_MISMATCH,
      );

      this.events.emit('payment:failed', {
        transaction: context.requireTransaction(),
        payload: context.payload,
      });

      context.fail(DETAILS_MISMATCH);

      return;
    }

    await next();
  }

  private matchesTransaction(transaction: TransactionRecord, payload: CallbackPayload): boolean {
    return (
      transaction.merchant_ref === payload.merchantRef &&
      transaction.merchant_session === payload.merchantSession &&
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
