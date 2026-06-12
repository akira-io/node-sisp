import { runWithLogSource } from '../database/log-context';
import type { Transaction } from '../database/models/transaction';
import { nowIso, type TransactionRecord } from '../database/records';
import { TransactionStatus } from '../enums/transaction-status';
import type { SispEventEmitter } from '../events';
import { TransactionStateError } from '../exceptions';

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
