import { TransactionStatus } from '../../domain/enums/transaction-status';
import { TransactionStateError } from '../../domain/errors/exceptions';
import { runWithLogSource } from '../../infrastructure/database/log-context';
import type { Transaction } from '../../infrastructure/database/models/transaction';
import { nowIso, type TransactionRecord } from '../../infrastructure/database/records';
import type { SispEventEmitter } from '../events';

const NOT_CANCELLABLE: readonly TransactionStatus[] = [
  TransactionStatus.Completed,
  TransactionStatus.Cancelled,
];

export class CancelTransactionAction {
  constructor(
    private readonly transactions: Transaction,
    private readonly events: SispEventEmitter,
  ) {}

  async handle(
    transaction: TransactionRecord,
    reason = 'user_cancelled',
  ): Promise<TransactionRecord> {
    if (NOT_CANCELLABLE.includes(transaction.status)) {
      throw new TransactionStateError(
        `Transaction with status '${transaction.status}' cannot be cancelled.`,
      );
    }

    const cancelled = await runWithLogSource('cancel', () =>
      this.transactions.update(transaction.id, {
        status: TransactionStatus.Cancelled,
        message_type: 'cancelled',
        merchant_response: reason,
        cancelled_at: nowIso(),
      }),
    );

    this.events.emit('transaction:cancelled', { transaction: cancelled, reason });

    return cancelled;
  }
}
