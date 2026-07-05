export interface TransactionItemData {
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly productId?: string | null;
  readonly description?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

export function transactionItemFrom(data: Record<string, unknown>): TransactionItemData {
  return Object.freeze({
    productName: String(data.product_name ?? ''),
    quantity: Number(data.quantity ?? 1),
    unitPrice: Number(data.unit_price ?? 0),
    totalPrice: Number(data.total_price ?? 0),
    productId: optionalText(data.product_id),
    description: optionalText(data.description),
    metadata: isRecord(data.metadata) ? Object.freeze({ ...data.metadata }) : null,
  });
}

export function transactionItemCollection(
  items: readonly unknown[],
): readonly TransactionItemData[] {
  return Object.freeze(items.filter(isRecord).map(transactionItemFrom));
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
