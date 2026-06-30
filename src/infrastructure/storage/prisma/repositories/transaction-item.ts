import type { SispTables } from '../../../../application/config';
import type { TransactionItemRepository } from '../../../../core/contracts/storage';
import type { TransactionItemRecord } from '../../../../domain/records';
import type { ListByTransactionOptions } from '../../../../domain/storage-types';
import type { TransactionItemData } from '../../../../domain/value-objects/transaction-item-data';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { nowIso } from '../../knex/records';
import { DELEGATE_NAMES, delegate, type PrismaClientLike } from '../client';
import { mapTransactionItem } from '../mapping';

export function makeTransactionItemRepository(
  client: PrismaClientLike,
  _tables: SispTables,
): TransactionItemRepository {
  const model = () => delegate(client, DELEGATE_NAMES.transactionItems);

  return {
    async createMany(transactionId: number, items: readonly TransactionItemData[]): Promise<void> {
      if (items.length === 0) {
        return;
      }

      const timestamp = nowIso();

      await model().createMany({
        data: items.map((item) => ({
          transactionId: BigInt(transactionId),
          productId: item.productId ?? null,
          productName: item.productName,
          quantity: item.quantity,
          unitPriceCents: BigInt(Math.round(item.unitPrice * 100)),
          totalPriceCents: BigInt(Math.round(item.totalPrice * 100)),
          description: item.description ?? null,
          metadata: item.metadata ? JSON.stringify(item.metadata) : null,
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
        })),
      });
    },

    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<TransactionItemRecord[]> {
      const rows = await model().findMany({
        where: { transactionId: BigInt(transactionId) },
        orderBy: { id: normalizeListOrder(options.order) },
        take: normalizeListLimit(options.limit),
        skip: normalizeListOffset(options.offset),
      });

      return rows.map(mapTransactionItem);
    },
  };
}
