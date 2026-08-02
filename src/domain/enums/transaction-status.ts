export const TransactionStatus = {
  Pending: 'pending',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled',
  Refunded: 'refunded',
} as const;

export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

const ALL_TRANSACTION_STATUSES: readonly string[] = Object.values(TransactionStatus);

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === 'string' && ALL_TRANSACTION_STATUSES.includes(value);
}
