import type { SispTables } from '../../../../application/config';
import type { InvoiceRepository } from '../../../../core/contracts/storage';
import type { InvoiceRecord, TransactionRecord } from '../../../../domain/records';
import type { InvoiceStatus } from '../../../../domain/enums/invoice-status';
import { nowIso } from '../../knex/records';
import { DELEGATE_NAMES, delegate, type PrismaClientLike } from '../client';
import { mapInvoice } from '../mapping';

const DUE_DAYS = 7;

export function makeInvoiceRepository(
  client: PrismaClientLike,
  _tables: SispTables,
  numberPrefix = 'INV',
): InvoiceRepository {
  const model = () => delegate(client, DELEGATE_NAMES.invoices);

  function invoiceNumber(transaction: TransactionRecord): string {
    const createdAt = transaction.created_at ? new Date(transaction.created_at) : new Date();
    const year = createdAt.getFullYear();
    const month = String(createdAt.getMonth() + 1).padStart(2, '0');
    const sequence = String(transaction.id).padStart(6, '0');

    return `${numberPrefix}-${year}${month}-${sequence}`;
  }

  return {
    async createForTransaction(transaction: TransactionRecord): Promise<InvoiceRecord> {
      const timestamp = nowIso();
      const invoiceDate = new Date();
      const dueDate = new Date(invoiceDate.getTime() + DUE_DAYS * 86_400_000);

      await model().create({
        data: {
          transactionId: BigInt(transaction.id),
          invoiceNumber: invoiceNumber(transaction),
          invoiceDate,
          dueDate,
          status: 'pending',
          customerName: transaction.customer_name ?? null,
          customerEmail: transaction.customer_email ?? null,
          customerCity: transaction.customer_city ?? null,
          customerAddress: transaction.customer_address ?? null,
          customerCountry: transaction.customer_country ?? null,
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
        },
      });

      const record = await this.findByTransaction(transaction.id);

      if (record === null) {
        throw new Error(`Invoice for transaction ${transaction.id} not found after insert.`);
      }

      return record;
    },

    async findByTransaction(transactionId: number): Promise<InvoiceRecord | null> {
      const row = await model().findFirst({
        where: { transactionId: BigInt(transactionId) },
      });

      return row ? mapInvoice(row) : null;
    },

    async updateStatus(transactionId: number, status: InvoiceStatus): Promise<void> {
      await model().updateMany({
        where: { transactionId: BigInt(transactionId) },
        data: {
          status,
          updatedAt: new Date(nowIso()),
        },
      });
    },
  };
}
