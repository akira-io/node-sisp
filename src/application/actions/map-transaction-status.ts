import { ERROR_MESSAGE_TYPE_VALUES } from '../../domain/enums/error-message-type';
import { SUCCESS_MESSAGE_TYPE_VALUES } from '../../domain/enums/success-message-type';
import { TransactionStatus } from '../../domain/enums/transaction-status';

export const AUTHORIZATION_SUCCESS_MESSAGE_TYPE = '10';
export const COMPLETED_MESSAGE_TYPE_VALUES = [
  ...SUCCESS_MESSAGE_TYPE_VALUES,
  AUTHORIZATION_SUCCESS_MESSAGE_TYPE,
];

export function mapTransactionStatus(messageType: string | null | undefined): TransactionStatus {
  if (messageType == null) {
    return TransactionStatus.Pending;
  }

  if (COMPLETED_MESSAGE_TYPE_VALUES.includes(messageType)) {
    return TransactionStatus.Completed;
  }

  if (ERROR_MESSAGE_TYPE_VALUES.includes(messageType)) {
    return TransactionStatus.Failed;
  }

  return TransactionStatus.Pending;
}
