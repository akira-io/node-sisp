import { runWithLogSource } from '../database/log-context';
import type { TransactionRecord } from '../database/records';
import type { TransactionRepository } from '../database/repositories/transaction-repository';
import { TransactionStatus } from '../enums/transaction-status';
import type { CallbackPayload } from '../value-objects/callback-payload';

export class FailTransactionAction {
  constructor(private readonly transactions: TransactionRepository) {}

  async handle(
    transaction: TransactionRecord,
    payload: CallbackPayload,
    merchantResponse: string,
  ): Promise<TransactionRecord> {
    return runWithLogSource('callback', () =>
      this.transactions.update(transaction.id, {
        transaction_id: String(payload.transactionID),
        message_type: payload.messageType,
        merchant_response: merchantResponse,
        response_code: payload.merchantRespCp,
        fingerprint: payload.fingerprint,
        status: TransactionStatus.Failed,
      }),
    );
  }
}
