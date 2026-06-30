import type { CallbackPipe } from '../../../../core/contracts/pipes';
import type { SispStorage } from '../../../../core/contracts/storage';
import { TransactionNotFoundError } from '../../../../domain/errors/exceptions';
import type {
  TransactionAttemptRecord,
  TransactionRecord,
} from '../../../../infrastructure/storage/knex/records';
import type { CallbackContext } from '../callback-context';

export class ResolveTransaction implements CallbackPipe {
  constructor(private readonly storage: SispStorage) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const attempt = await this.storage.transactionAttempts.findByRefAndSession(
      context.payload.merchantRef,
      context.payload.merchantSession,
    );

    if (attempt !== null) {
      const transaction = await this.storage.transactions.findById(attempt.transaction_id);

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
    return this.storage.transaction(async (tx) => {
      const transaction = await tx.transactions.findByRefAndSessionForUpdate(
        context.payload.merchantRef,
        context.payload.merchantSession,
      );

      if (transaction === null) {
        throw new TransactionNotFoundError(
          `No transaction found for merchantRef ${context.payload.merchantRef}.`,
        );
      }

      const attempt = await tx.transactionAttempts.findByRefAndSessionForUpdate(
        context.payload.merchantRef,
        context.payload.merchantSession,
      );

      return {
        transaction,
        attempt: attempt ?? (await tx.transactionAttempts.createFromTransaction(transaction)),
      };
    });
  }
}
