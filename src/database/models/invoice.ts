import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import type { InvoiceStatus } from '../../enums/invoice-status';
import { type InvoiceRecord, nowIso, type TransactionRecord } from '../records';

const DUE_DAYS = 7;

export class Invoice {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
    private readonly numberPrefix: string = 'INV',
  ) {}

  async createForTransaction(transaction: TransactionRecord): Promise<InvoiceRecord> {
    const timestamp = nowIso();
    const invoiceDate = new Date();
    const dueDate = new Date(invoiceDate.getTime() + DUE_DAYS * 86_400_000);

    await this.db(this.tables.invoices).insert({
      transaction_id: transaction.id,
      invoice_number: this.invoiceNumber(transaction),
      invoice_date: isoDate(invoiceDate),
      due_date: isoDate(dueDate),
      status: 'pending',
      customer_name: transaction.customer_name,
      customer_email: transaction.customer_email,
      customer_city: transaction.customer_city,
      customer_address: transaction.customer_address,
      customer_country: transaction.customer_country,
      created_at: timestamp,
      updated_at: timestamp,
    });

    const record = await this.findByTransaction(transaction.id);

    if (record === null) {
      throw new Error(`Invoice for transaction ${transaction.id} not found after insert.`);
    }

    return record;
  }

  async findByTransaction(transactionId: number): Promise<InvoiceRecord | null> {
    const row = await this.db(this.tables.invoices).where('transaction_id', transactionId).first();

    return (row as InvoiceRecord | undefined) ?? null;
  }

  async updateStatus(transactionId: number, status: InvoiceStatus): Promise<void> {
    await this.db(this.tables.invoices)
      .where('transaction_id', transactionId)
      .update({ status, updated_at: nowIso() });
  }

  private invoiceNumber(transaction: TransactionRecord): string {
    const createdAt = transaction.created_at ? new Date(transaction.created_at) : new Date();
    const year = createdAt.getFullYear();
    const month = String(createdAt.getMonth() + 1).padStart(2, '0');
    const sequence = String(transaction.id).padStart(6, '0');

    return `${this.numberPrefix}-${year}${month}-${sequence}`;
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
