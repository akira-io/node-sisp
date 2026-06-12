import { runWithLogSource } from '../database/log-context';
import type { Transaction } from '../database/models/transaction';
import { type TransactionRecord, transactionPayloadRecord } from '../database/records';
import type { SispManager } from '../drivers/sisp-manager';
import { TransactionStatus } from '../enums/transaction-status';
import {
  paymentStatusOf,
  type TransactionStatusResponse,
} from '../value-objects/transaction-status-response';
import type { UpdateInvoiceStatusAction } from './update-invoice-status';

export class ReconcileTransactionStatusAction {
  constructor(
    private readonly manager: SispManager,
    private readonly transactions: Transaction,
    private readonly updateInvoiceStatus: UpdateInvoiceStatusAction,
  ) {}

  async handle(transaction: TransactionRecord): Promise<TransactionRecord> {
    if (transaction.status !== TransactionStatus.Pending) {
      return transaction;
    }

    let response: TransactionStatusResponse;

    try {
      response = await this.manager.driver().queryTransactionStatus(transaction.merchant_ref);
    } catch {
      return transaction;
    }

    return this.applyResponse(transaction, response);
  }

  async applyResponse(
    transaction: TransactionRecord,
    response: TransactionStatusResponse,
  ): Promise<TransactionRecord> {
    if (transaction.status !== TransactionStatus.Pending || !response.result) {
      return transaction;
    }

    const reconciled = await runWithLogSource('reconciliation', () =>
      this.transactions.update(transaction.id, {
        status: paymentStatusOf(response),
        merchant_response: response.transactionStatusDescription || response.message,
        payload: {
          ...transactionPayloadRecord(transaction),
          transaction_status_response: response.raw,
        },
      }),
    );

    await this.updateInvoiceStatus.handle(reconciled);

    return reconciled;
  }
}
