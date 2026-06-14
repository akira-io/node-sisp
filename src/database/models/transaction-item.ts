import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import type { TransactionItemData } from '../../value-objects/transaction-item-data';
import { nowIso, type TransactionItemRecord } from '../records';

export class TransactionItem {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
  ) {}

  withConnection(connection: Knex): TransactionItem {
    return new TransactionItem(connection, this.tables);
  }

  async createMany(transactionId: number, items: readonly TransactionItemData[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const timestamp = nowIso();

    await this.db(this.tables.transactionItems).insert(
      items.map((item) => ({
        transaction_id: transactionId,
        product_id: item.productId ?? null,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price_cents: Math.round(item.unitPrice * 100),
        total_price_cents: Math.round(item.totalPrice * 100),
        description: item.description ?? null,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null,
        created_at: timestamp,
        updated_at: timestamp,
      })),
    );
  }

  async listByTransaction(transactionId: number): Promise<TransactionItemRecord[]> {
    const rows = await this.db(this.tables.transactionItems)
      .where('transaction_id', transactionId)
      .orderBy('id');

    return rows.map((row: Record<string, unknown>) => ({
      ...(row as unknown as TransactionItemRecord),
      metadata: parseJsonColumn(row.metadata),
    }));
  }
}

function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
