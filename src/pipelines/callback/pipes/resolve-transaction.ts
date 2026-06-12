import type { CallbackPipe } from '../../../contracts/pipes';
import type { TransactionRepository } from '../../../database/models/transaction-repository';
import { TransactionNotFoundError } from '../../../exceptions';
import type { CallbackContext } from '../callback-context';

export class ResolveTransaction implements CallbackPipe {
  constructor(private readonly transactions: TransactionRepository) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const transaction = await this.transactions.findByRefAndSession(
      context.payload.merchantRef,
      context.payload.merchantSession,
    );

    if (transaction === null) {
      throw new TransactionNotFoundError(
        `No transaction found for merchantRef ${context.payload.merchantRef}.`,
      );
    }

    context.transaction = transaction;

    await next();
  }
}
