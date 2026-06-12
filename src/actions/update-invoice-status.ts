import type { InvoiceRepository } from '../database/repositories/invoice-repository';
import type { TransactionRecord } from '../database/records';
import { InvoiceStatus } from '../enums/invoice-status';
import { TransactionStatus } from '../enums/transaction-status';

const STATUS_MAP: Partial<Record<TransactionStatus, InvoiceStatus>> = {
  [TransactionStatus.Completed]: InvoiceStatus.Paid,
  [TransactionStatus.Failed]: InvoiceStatus.Cancelled,
  [TransactionStatus.Pending]: InvoiceStatus.Pending,
};

export class UpdateInvoiceStatusAction {
  constructor(private readonly invoices: InvoiceRepository) {}

  async handle(transaction: TransactionRecord): Promise<void> {
    const invoiceStatus = STATUS_MAP[transaction.status];

    if (invoiceStatus === undefined) {
      return;
    }

    const invoice = await this.invoices.findByTransaction(transaction.id);

    if (invoice === null) {
      return;
    }

    await this.invoices.updateStatus(transaction.id, invoiceStatus);
  }
}
