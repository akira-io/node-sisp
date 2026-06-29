export const InvoiceStatus = {
  Pending: 'pending',
  Issued: 'issued',
  Paid: 'paid',
  Overdue: 'overdue',
  Cancelled: 'cancelled',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
