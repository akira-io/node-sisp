export const MessageType = {
  Purchase: '8',
  ServicePayment: 'P',
  PhoneRecharge: 'M',
  EnrollmentRequest: 'A',
  TokenPayment: 'B',
  TokenCancel: 'C',
  TotalReversal: '10',
  PartialRefund: '?',
  Error: '6',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const SUCCESS_MESSAGE_TYPES: readonly string[] = [
  MessageType.Purchase,
  MessageType.ServicePayment,
  MessageType.PhoneRecharge,
  MessageType.EnrollmentRequest,
  MessageType.TokenPayment,
  MessageType.TokenCancel,
  MessageType.TotalReversal,
  MessageType.PartialRefund,
];

export function isSuccessMessageType(value: string): boolean {
  return SUCCESS_MESSAGE_TYPES.includes(value);
}

export function isErrorMessageType(value: string): boolean {
  return value === MessageType.Error;
}
