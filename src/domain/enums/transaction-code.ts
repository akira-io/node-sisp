export const TransactionCode = {
  Purchase: '1',
  ServicePayment: '2',
  PhoneRecharge: '3',
  EnrollmentRequest: '5',
  TokenPurchase: '6',
  TokenCancel: '7',
} as const;

export type TransactionCode = (typeof TransactionCode)[keyof typeof TransactionCode];

export const RefundTransactionCode = {
  TotalReversal: '4',
  PartialReversal: '8',
  History: '9',
  Reversal: 'R',
} as const;

export type RefundTransactionCode =
  (typeof RefundTransactionCode)[keyof typeof RefundTransactionCode];
