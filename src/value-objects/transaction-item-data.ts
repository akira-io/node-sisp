export interface TransactionItemData {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function transactionItemFrom(data: Record<string, unknown>): TransactionItemData {
  return {
    productName: String(data.product_name ?? ''),
    quantity: Number(data.quantity ?? 1),
    unitPrice: Number(data.unit_price ?? 0),
    totalPrice: Number(data.total_price ?? 0),
    productId: optionalText(data.product_id),
    description: optionalText(data.description),
    metadata: isRecord(data.metadata) ? data.metadata : null,
  };
}

export function transactionItemCollection(items: readonly unknown[]): TransactionItemData[] {
  return items.filter(isRecord).map(transactionItemFrom);
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
