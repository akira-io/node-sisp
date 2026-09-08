import type { CallbackPipe } from '../../../../core/contracts/pipes';
import type { SispStorage } from '../../../../core/contracts/storage';
import { TransactionNotFoundError } from '../../../../domain/errors/exceptions';
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

    const legacy = await this.storage.transactions.findByRefAndSession(
      context.payload.merchantRef,
      context.payload.merchantSession,
    );

    if (legacy === null) {
      throw new TransactionNotFoundError(
        `No transaction found for merchantRef ${context.payload.merchantRef}.`,
      );
    }

    context.attempt = null;
    context.transaction = legacy;

    await next();
  }
}
