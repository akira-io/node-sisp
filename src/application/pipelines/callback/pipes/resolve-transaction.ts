import type { Knex } from 'knex';
import type { CallbackPipe } from '../../../../core/contracts/pipes';
import { TransactionNotFoundError } from '../../../../domain/errors/exceptions';
import type { Transaction } from '../../../../infrastructure/database/models/transaction';
import type { TransactionAttempt } from '../../../../infrastructure/database/models/transaction-attempt';
import type {
  TransactionAttemptRecord,
  TransactionRecord,
} from '../../../../infrastructure/database/records';
import type { CallbackContext } from '../callback-context';

export class ResolveTransaction implements CallbackPipe {
  constructor(
    private readonly db: Knex,
    private readonly transactions: Transaction,
    private readonly attempts: TransactionAttempt,
  ) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const attempt = await this.attempts.findByRefAndSession(
      context.payload.merchantRef,
      context.payload.merchantSession,
    );

    if (attempt !== null) {
      const transaction = await this.transactions.findById(attempt.transaction_id);

      if (transaction === null) {
        throw new TransactionNotFoundError(
          `No transaction found for merchantRef ${context.payload.merchantRef}.`,
        );
      }

      context.attempt = attempt;
      context.transaction = transaction;

      await next();

      return;
    }

    const resolved = await this.resolveLegacyTransaction(context);

    context.attempt = resolved.attempt;
    context.transaction = resolved.transaction;

    await next();
  }

  private async resolveLegacyTransaction(
    context: CallbackContext,
  ): Promise<{ transaction: TransactionRecord; attempt: TransactionAttemptRecord }> {
    return this.db.transaction(async (trx) => {
      const transactions = this.transactions.withConnection(trx);
      const attempts = this.attempts.withConnection(trx);
      const transaction = await transactions.findByRefAndSessionForUpdate(
        context.payload.merchantRef,
        context.payload.merchantSession,
      );

      if (transaction === null) {
        throw new TransactionNotFoundError(
          `No transaction found for merchantRef ${context.payload.merchantRef}.`,
        );
      }

      const attempt = await attempts.findByRefAndSessionForUpdate(
        context.payload.merchantRef,
        context.payload.merchantSession,
      );

      return {
        transaction,
        attempt: attempt ?? (await attempts.createFromTransaction(transaction)),
      };
    });
  }
}
