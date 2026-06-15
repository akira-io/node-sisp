import type { CallbackPipe } from '../../../contracts/pipes';
import type { Transaction } from '../../../database/models/transaction';
import type { TransactionAttempt } from '../../../database/models/transaction-attempt';
import { TransactionNotFoundError } from '../../../exceptions';
import type { CallbackContext } from '../callback-context';

export class ResolveTransaction implements CallbackPipe {
  constructor(
    private readonly transactions: Transaction,
    private readonly attempts: TransactionAttempt,
  ) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    let attempt = await this.attempts.findByRefAndSession(
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

    const transaction = await this.transactions.findByRefAndSession(
      context.payload.merchantRef,
      context.payload.merchantSession,
    );

    if (transaction === null) {
      throw new TransactionNotFoundError(
        `No transaction found for merchantRef ${context.payload.merchantRef}.`,
      );
    }

    attempt = await this.attempts.createFromTransaction(transaction);

    context.attempt = attempt;
    context.transaction = transaction;

    await next();
  }
}
