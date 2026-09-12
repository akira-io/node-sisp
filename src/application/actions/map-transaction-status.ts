import { isErrorMessageType, isSuccessMessageType } from '../../domain/enums/message-type';
import { TransactionStatus } from '../../domain/enums/transaction-status';

export function mapTransactionStatus(messageType: string | null | undefined): TransactionStatus {
  if (messageType == null) {
    return TransactionStatus.Pending;
  }

  if (isSuccessMessageType(messageType)) {
    return TransactionStatus.Completed;
  }

  if (isErrorMessageType(messageType)) {
    return TransactionStatus.Failed;
  }

  return TransactionStatus.Pending;
}
