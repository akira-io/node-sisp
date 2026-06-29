import type { Knex } from 'knex';
import { runWithLogSource } from '../database/log-context';
import type { Transaction } from '../database/models/transaction';
import { nowIso, type TransactionRecord, transactionPayloadRecord } from '../database/records';
import { TransactionStatus } from '../enums/transaction-status';
import type { SispEventEmitter } from '../events';
import { SispError, TransactionStateError } from '../exceptions';
import { toThousandths } from '../support/sisp-amount';
import { refundRequestToRecord } from '../value-objects/refund-request';
import type { BuildRefundRequestAction } from './build-refund-request';

export class RefundTransactionAction {
  constructor(
    private readonly db: Knex,
    private readonly transactions: Transaction,
    private readonly buildRefundRequest: BuildRefundRequestAction,
    private readonly events: SispEventEmitter,
  ) {}

  async handle(
    transaction: TransactionRecord,
    refundAmount: number,
    reason = 'user_refund',
  ): Promise<TransactionRecord> {
    const refundThousandths = toThousandths(refundAmount);

    if (refundAmount <= 0 || refundThousandths <= 0) {
      throw new SispError('Refund amount must be greater than 0.');
    }

    const refunded = await this.db.transaction(async (trx) => {
      const transactions = this.transactions.withConnection(trx);
      const locked = await transactions.findByIdForUpdate(transaction.id);

      if (locked === null) {
        throw new SispError(`Transaction ${transaction.id} not found.`);
      }

      return this.refundLockedTransaction(
        transactions,
        locked,
        refundAmount,
        refundThousandths,
        reason,
      );
    });

    this.events.emit('transaction:refunded', {
      transaction: refunded,
      amount: refundAmount,
      reason,
    });

    return refunded;
  }

  private async refundLockedTransaction(
    transactions: Transaction,
    transaction: TransactionRecord,
    refundAmount: number,
    refundThousandths: number,
    reason: string,
  ): Promise<TransactionRecord> {
    if (transaction.status !== TransactionStatus.Completed) {
      throw new TransactionStateError(
        `Transaction with status '${transaction.status}' cannot be refunded.`,
      );
    }

    const refundableThousandths = this.refundableThousandths(transaction);

    if (refundThousandths > refundableThousandths) {
      throw new SispError(`Refund amount (${refundAmount}) exceeds refundable balance.`);
    }

    const request = this.buildRequest(transaction, refundThousandths);
    const payload = this.appendRefundPayload(transaction, refundRequestToRecord(request), reason);
    const remainingThousandths = refundableThousandths - refundThousandths;

    return runWithLogSource('refund', () =>
      transactions.update(transaction.id, {
        status:
          remainingThousandths === 0 ? TransactionStatus.Refunded : TransactionStatus.Completed,
        merchant_response: `${reason}::${refundAmount}`,
        payload,
        refunded_at: nowIso(),
      }),
    );
  }

  private buildRequest(transaction: TransactionRecord, refundThousandths: number) {
    const transactionThousandths = toThousandths(transaction.amount);
    const alreadyRefunded = this.refundedThousandths(transaction);

    if (alreadyRefunded === 0 && refundThousandths === transactionThousandths) {
      return this.buildRefundRequest.total(transaction);
    }

    return this.buildRefundRequest.partial(transaction, refundThousandths / 1000);
  }

  private refundableThousandths(transaction: TransactionRecord): number {
    return Math.max(0, toThousandths(transaction.amount) - this.refundedThousandths(transaction));
  }

  private refundedThousandths(transaction: TransactionRecord): number {
    return refundEntries(transaction).reduce(
      (total, refund) => total + toThousandths(amountOf(refund)),
      0,
    );
  }

  private appendRefundPayload(
    transaction: TransactionRecord,
    request: Record<string, string | number>,
    reason: string,
  ): Record<string, unknown> {
    const payload = transactionPayloadRecord(transaction);
    const refunds = refundEntries(transaction);

    return {
      ...payload,
      refunds: [...refunds, { amount: request.amount, reason, request }],
    };
  }
}

function refundEntries(transaction: TransactionRecord): Record<string, unknown>[] {
  const refunds = transactionPayloadRecord(transaction).refunds;

  if (!Array.isArray(refunds)) {
    return [];
  }

  return refunds.filter(
    (refund): refund is Record<string, unknown> =>
      typeof refund === 'object' && refund !== null && !Array.isArray(refund),
  );
}

function amountOf(refund: Record<string, unknown>): number | string {
  const amount = refund.amount;

  if (typeof amount === 'number' || typeof amount === 'string') {
    return amount;
  }

  return 0;
}
