import type { Knex } from 'knex';
import type { ResolvedSispConfig } from '../config';
import { runWithLogSource } from '../database/log-context';
import type { Transaction } from '../database/models/transaction';
import type { TransactionAttempt } from '../database/models/transaction-attempt';
import type { TransactionAttemptRecord, TransactionRecord } from '../database/records';
import { TransactionStatus } from '../enums/transaction-status';
import {
  TransactionStateError,
  UnableToGenerateUniquePaymentIdentifiersError,
} from '../exceptions';
import { isUniqueConstraintError, sleep } from '../support/database-errors';
import type { PaymentRequest } from '../value-objects/payment-request';
import type { CanRetryPaymentAction } from './can-retry-payment';
import type { RetryPaymentAction } from './retry-payment';

export class CreateRetryPaymentAttemptAction {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly db: Knex,
    private readonly transactions: Transaction,
    private readonly attempts: TransactionAttempt,
    private readonly retryPayment: RetryPaymentAction,
    private readonly canRetryPayment: CanRetryPaymentAction,
  ) {}

  async handle(transaction: TransactionRecord): Promise<PaymentRequest> {
    const maxAttempts = Math.max(1, this.config.identifierGeneration.maxAttempts);
    const currentAttempts = await this.ensureInitialAttempt(transaction);

    this.canRetryPayment.ensureRetryLimit(currentAttempts.length);

    if (!this.canRetryPayment.handle(transaction, currentAttempts.length)) {
      throw new TransactionStateError('This payment cannot be retried.');
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const paymentRequest = this.retryPayment.handle(transaction);

      try {
        await this.db.transaction(async (trx) => {
          const trxAttempts = this.attempts.withConnection(trx);
          const trxTransactions = this.transactions.withConnection(trx);

          await trxAttempts.createForPayment(transaction, paymentRequest, true);

          await runWithLogSource('retry', () =>
            trxTransactions.update(transaction.id, {
              merchant_session: paymentRequest.merchantSession,
              transaction_id: null,
              message_type: null,
              merchant_response: null,
              response_code: null,
              fingerprint: null,
              status: TransactionStatus.Pending,
            }),
          );
        });

        return paymentRequest;
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        if (attempt >= maxAttempts) {
          throw new UnableToGenerateUniquePaymentIdentifiersError(maxAttempts);
        }

        await sleep(this.config.identifierGeneration.collisionRetrySleepMs);
      }
    }

    throw new UnableToGenerateUniquePaymentIdentifiersError(maxAttempts);
  }

  private async ensureInitialAttempt(
    transaction: TransactionRecord,
  ): Promise<TransactionAttemptRecord[]> {
    const currentAttempts = await this.attempts.listByTransaction(transaction.id);

    if (currentAttempts.length > 0) {
      return currentAttempts;
    }

    try {
      await this.attempts.createFromTransaction(transaction);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      if ((await this.attempts.listByTransaction(transaction.id)).length === 0) {
        throw error;
      }
    }

    return this.attempts.listByTransaction(transaction.id);
  }
}
