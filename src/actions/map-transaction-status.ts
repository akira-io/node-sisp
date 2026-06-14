import { ERROR_MESSAGE_TYPE_VALUES } from '../enums/error-message-type';
import { SUCCESS_MESSAGE_TYPE_VALUES } from '../enums/success-message-type';
import { TransactionStatus } from '../enums/transaction-status';

const ADDITIONAL_SUCCESS_VALUES = ['10'];

export function mapTransactionStatus(messageType: string | null | undefined): TransactionStatus {
  if (messageType == null) {
    return TransactionStatus.Pending;
  }

  if (
    SUCCESS_MESSAGE_TYPE_VALUES.includes(messageType) ||
    ADDITIONAL_SUCCESS_VALUES.includes(messageType)
  ) {
    return TransactionStatus.Completed;
  }

  if (ERROR_MESSAGE_TYPE_VALUES.includes(messageType)) {
    return TransactionStatus.Failed;
  }

  return TransactionStatus.Pending;
}
