import { mapTransactionStatus } from '../../../actions/map-transaction-status';
import type { CallbackPipe } from '../../../contracts/pipes';
import { runWithLogSource } from '../../../database/log-context';
import type { Transaction } from '../../../database/models/transaction';
import {
  attemptChangesFromCallback,
  isCurrentAttempt,
  type TransactionAttempt,
} from '../../../database/models/transaction-attempt';
import { TransactionStatus } from '../../../enums/transaction-status';
import type { CallbackContext } from '../callback-context';

export class ApplyTransactionStatus implements CallbackPipe {
  constructor(
    private readonly transactions: Transaction,
    private readonly attempts: TransactionAttempt,
  ) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const transaction = context.requireTransaction();
    const attempt = context.requireAttempt();
    const payload = context.payload;
    const status = mapTransactionStatus(payload.messageType);

    const updatedAttempt = await this.attempts.update(
      attempt.id,
      attemptChangesFromCallback(payload, status),
    );

    if (!isCurrentAttempt(updatedAttempt) && status !== TransactionStatus.Completed) {
      context.transactionStatusPropagated = false;

      await next();

      return;
    }

    context.transaction = await runWithLogSource('callback', () =>
      this.transactions.update(transaction.id, {
        merchant_session: updatedAttempt.merchant_session,
        transaction_id: String(payload.transactionID),
        message_type: payload.messageType,
        merchant_response: payload.merchantResponse,
        response_code: payload.merchantRespCp,
        fingerprint: payload.fingerprint,
        status,
      }),
    );

    await next();
  }
}
