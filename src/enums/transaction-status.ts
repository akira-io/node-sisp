export const TransactionStatus = {
  Pending: 'pending',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled',
  Refunded: 'refunded',
} as const;

export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];
