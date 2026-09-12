import { eq } from 'drizzle-orm';
import type { TransactionItemRepository } from '../../../../core/contracts/storage';
import type { TransactionItemRecord } from '../../../../domain/records';
import type { ListByTransactionOptions } from '../../../../domain/storage-types';
import type { TransactionItemData } from '../../../../domain/value-objects/transaction-item-data';
import { toCents } from '../../../../support/sisp-amount';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { nowIso } from '../../knex/records';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

export function makeTransactionItemRepository(
  context: RepositoryContext,
): TransactionItemRepository {
  const rows = () => gateway(context, 'transactionItems');

  return {
    async createMany(transactionId: number, items: readonly TransactionItemData[]): Promise<void> {
      if (items.length === 0) {
        return;
      }

      const timestamp = nowIso();

      await rows().insert(
        items.map((item) => ({
          transaction_id: transactionId,
          product_id: item.productId ?? null,
          product_name: item.productName,
          quantity: item.quantity,
          unit_price_cents: toCents(item.unitPrice),
          total_price_cents: toCents(item.totalPrice),
          description: item.description ?? null,
          metadata: item.metadata ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        })),
      );
    },

    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<TransactionItemRecord[]> {
      const table = rows();
      const found = await table.all(eq(table.column('transaction_id'), transactionId), {
        orderBy: [table.ordered('id', normalizeListOrder(options.order))],
        limit: normalizeListLimit(options.limit),
        offset: normalizeListOffset(options.offset),
      });

      return found.map(
        (row) => normalizeRow('transactionItems', row) as unknown as TransactionItemRecord,
      );
    },
  };
}
