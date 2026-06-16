import type { Knex } from 'knex';
import { mapTransactionStatus } from '../../../actions/map-transaction-status';
import type { CallbackPipe } from '../../../contracts/pipes';
import { runWithLogSource } from '../../../database/log-context';
import type { Transaction } from '../../../database/models/transaction';
import {
  attemptChangesFromCallback,
  shouldPropagateAttemptToTransaction,
  type TransactionAttempt,
} from '../../../database/models/transaction-attempt';
import type { CallbackContext } from '../callback-context';

export class ApplyTransactionStatus implements CallbackPipe {
  constructor(
    private readonly db: Knex,
    private readonly transactions: Transaction,
    private readonly attempts: TransactionAttempt,
  ) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const transaction = context.requireTransaction();
    const attempt = context.requireAttempt();
    const payload = context.payload;
    const status = mapTransactionStatus(payload.messageType);

    const result = await this.db.transaction(async (trx) => {
      const attempts = this.attempts.withConnection(trx);
      const transactions = this.transactions.withConnection(trx);
      const updatedAttempt = await attempts.update(
        attempt.id,
        attemptChangesFromCallback(payload, status),
      );

      if (!shouldPropagateAttemptToTransaction(updatedAttempt, status)) {
        return { attempt: updatedAttempt, transaction, propagated: false };
      }

      const updatedTransaction = await runWithLogSource('callback', () =>
        transactions.update(transaction.id, {
          merchant_session: updatedAttempt.merchant_session,
          transaction_id: String(payload.transactionID),
          message_type: payload.messageType,
          merchant_response: payload.merchantResponse,
          response_code: payload.merchantRespCp,
          fingerprint: payload.fingerprint,
          status,
        }),
      );

      return { attempt: updatedAttempt, transaction: updatedTransaction, propagated: true };
    });

    context.attempt = result.attempt;

    if (!result.propagated) {
      context.transactionStatusPropagated = false;

      await next();

      return;
    }

    context.transaction = result.transaction;

    await next();
  }
}
