import { eq } from 'drizzle-orm';
import type { InvoiceRepository } from '../../../../core/contracts/storage';
import type { InvoiceStatus } from '../../../../domain/enums/invoice-status';
import type { InvoiceRecord, TransactionRecord } from '../../../../domain/records';
import { nowIso } from '../../knex/records';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

const DUE_DAYS = 7;
const NUMBER_PREFIX = 'INV';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function invoiceNumber(transaction: TransactionRecord): string {
  const createdAt = transaction.created_at ? new Date(transaction.created_at) : new Date();
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const sequence = String(transaction.id).padStart(6, '0');

  return `${NUMBER_PREFIX}-${year}${month}-${sequence}`;
}

export function makeInvoiceRepository(context: RepositoryContext): InvoiceRepository {
  const rows = () => gateway(context, 'invoices');

  async function findByTransaction(transactionId: number): Promise<InvoiceRecord | null> {
    const table = rows();
    const row = await table.first(eq(table.column('transaction_id'), transactionId));

    return row ? (normalizeRow('invoices', row) as unknown as InvoiceRecord) : null;
  }

  return {
    async createForTransaction(transaction: TransactionRecord): Promise<InvoiceRecord> {
      const timestamp = nowIso();
      const invoiceDate = new Date();
      const dueDate = new Date(invoiceDate.getTime() + DUE_DAYS * 86_400_000);

      await rows().insert({
        transaction_id: transaction.id,
        invoice_number: invoiceNumber(transaction),
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

      const record = await findByTransaction(transaction.id);

      if (record === null) {
        throw new Error(`Invoice for transaction ${transaction.id} not found after insert.`);
      }

      return record;
    },

    findByTransaction,

    async updateStatus(transactionId: number, status: InvoiceStatus): Promise<void> {
      const table = rows();

      await table.update(eq(table.column('transaction_id'), transactionId), {
        status,
        updated_at: nowIso(),
      });
    },
  };
}
