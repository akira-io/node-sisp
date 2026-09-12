import type { SispStorage } from '../../core/contracts/storage';
import { TransactionStatus } from '../../domain/enums/transaction-status';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';
import { runWithLogSource } from '../../infrastructure/storage/knex/log-context';
import {
  attemptChangesFromCallback,
  shouldPropagateAttemptToTransaction,
} from '../../infrastructure/storage/knex/models/transaction-attempt';
import type {
  TransactionAttemptRecord,
  TransactionRecord,
} from '../../infrastructure/storage/knex/records';

export interface FailedTransactionResult {
  transaction: TransactionRecord;
  propagated: boolean;
}

export class FailTransactionAction {
  constructor(private readonly storage: SispStorage) {}

  async handle(
    transaction: TransactionRecord,
    payload: CallbackPayload,
    merchantResponse: string,
    attempt: TransactionAttemptRecord | null = null,
  ): Promise<FailedTransactionResult> {
    return this.storage.transaction(async (tx) => {
      if (attempt !== null) {
        const updatedAttempt = await tx.transactionAttempts.update(
          attempt.id,
          attemptChangesFromCallback(payload, TransactionStatus.Failed, merchantResponse),
        );

        if (!shouldPropagateAttemptToTransaction(updatedAttempt, TransactionStatus.Failed)) {
          return { transaction, propagated: false };
        }

        transaction = { ...transaction, merchant_session: updatedAttempt.merchant_session };
      }

      const failed = await runWithLogSource('callback', () =>
        tx.transactions.update(transaction.id, {
          merchant_session: transaction.merchant_session,
          transaction_id: String(payload.transactionID),
          message_type: payload.messageType,
          merchant_response: merchantResponse,
          response_code: payload.merchantRespCp,
          fingerprint: payload.fingerprint,
          status: TransactionStatus.Failed,
        }),
      );

      return { transaction: failed, propagated: true };
    });
  }
}
