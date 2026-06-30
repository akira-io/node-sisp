export interface ListByTransactionOptions {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export const DEFAULT_LIST_BY_TRANSACTION_LIMIT = 100;

export function normalizeListLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined) {
    return DEFAULT_LIST_BY_TRANSACTION_LIMIT;
  }

  return Math.max(1, Math.min(DEFAULT_LIST_BY_TRANSACTION_LIMIT, Math.trunc(limit)));
}

export function normalizeListOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset) || offset === undefined) {
    return 0;
  }

  return Math.max(0, Math.trunc(offset));
}

export function normalizeListOrder(order: ListByTransactionOptions['order']): 'asc' | 'desc' {
  return order === 'desc' ? 'desc' : 'asc';
}
