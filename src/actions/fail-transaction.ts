import type { Knex } from 'knex';
import { runWithLogSource } from '../database/log-context';
import type { Transaction } from '../database/models/transaction';
import {
  attemptChangesFromCallback,
  shouldPropagateAttemptToTransaction,
  type TransactionAttempt,
} from '../database/models/transaction-attempt';
import type { TransactionAttemptRecord, TransactionRecord } from '../database/records';
import { TransactionStatus } from '../enums/transaction-status';
import type { CallbackPayload } from '../value-objects/callback-payload';

export interface FailedTransactionResult {
  transaction: TransactionRecord;
  propagated: boolean;
}

export class FailTransactionAction {
  constructor(
    private readonly db: Knex,
    private readonly transactions: Transaction,
    private readonly attempts: TransactionAttempt,
  ) {}

  async handle(
    transaction: TransactionRecord,
    payload: CallbackPayload,
    merchantResponse: string,
    attempt: TransactionAttemptRecord | null = null,
  ): Promise<FailedTransactionResult> {
    return this.db.transaction(async (trx) => {
      const transactions = this.transactions.withConnection(trx);
      const attempts = this.attempts.withConnection(trx);

      if (attempt !== null) {
        const updatedAttempt = await attempts.update(
          attempt.id,
          attemptChangesFromCallback(payload, TransactionStatus.Failed, merchantResponse),
        );

        if (!shouldPropagateAttemptToTransaction(updatedAttempt, TransactionStatus.Failed)) {
          return { transaction, propagated: false };
        }

        transaction = { ...transaction, merchant_session: updatedAttempt.merchant_session };
      }

      const failed = await runWithLogSource('callback', () =>
        transactions.update(transaction.id, {
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
