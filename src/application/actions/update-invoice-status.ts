import { InvoiceStatus } from '../../domain/enums/invoice-status';
import { TransactionStatus } from '../../domain/enums/transaction-status';
import type { Invoice } from '../../infrastructure/storage/knex/models/invoice';
import type { TransactionRecord } from '../../infrastructure/storage/knex/records';

const STATUS_MAP: Partial<Record<TransactionStatus, InvoiceStatus>> = {
  [TransactionStatus.Completed]: InvoiceStatus.Paid,
  [TransactionStatus.Failed]: InvoiceStatus.Cancelled,
  [TransactionStatus.Pending]: InvoiceStatus.Pending,
};

export class UpdateInvoiceStatusAction {
  constructor(private readonly invoices: Invoice) {}

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
