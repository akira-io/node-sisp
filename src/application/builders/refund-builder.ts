import type { TransactionRecord } from '../../infrastructure/storage/knex/records';
import type { RefundTransactionAction } from '../actions/refund-transaction';

export class RefundBuilder {
  private refundAmount: number | null = null;

  private refundReason = 'user_refund';

  constructor(
    private readonly refundTransaction: RefundTransactionAction,
    private readonly transaction: TransactionRecord,
  ) {}

  amount(amount: number): this {
    this.refundAmount = amount;

    return this;
  }

  full(): this {
    this.refundAmount = this.transaction.amount;

    return this;
  }

  reason(reason: string): this {
    this.refundReason = reason;

    return this;
  }

  async process(): Promise<TransactionRecord> {
    if (this.refundAmount === null) {
      throw new Error('A refund amount is required. Call amount() or full() first.');
    }

    return this.refundTransaction.handle(this.transaction, this.refundAmount, this.refundReason);
  }
}
