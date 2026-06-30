import type { SispStorage } from '../../core/contracts/storage';
import { TransactionStatus } from '../../domain/enums/transaction-status';
import {
  TransactionStateError,
  UnableToGenerateUniquePaymentIdentifiersError,
} from '../../domain/errors/exceptions';
import type { PaymentRequest } from '../../domain/value-objects/payment-request';
import { runWithLogSource } from '../../infrastructure/storage/knex/log-context';
import type {
  TransactionAttemptRecord,
  TransactionRecord,
} from '../../infrastructure/storage/knex/records';
import { isUniqueConstraintError, sleep } from '../../support/database-errors';
import type { ResolvedSispConfig } from '../config';
import type { CanRetryPaymentAction } from './can-retry-payment';
import type { RetryPaymentAction } from './retry-payment';

export class CreateRetryPaymentAttemptAction {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly storage: SispStorage,
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
        await this.storage.transaction(async (tx) => {
          await tx.transactionAttempts.createForPayment(transaction, paymentRequest, true);

          await runWithLogSource('retry', () =>
            tx.transactions.update(transaction.id, {
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
    const currentAttempts = await this.storage.transactionAttempts.listByTransaction(
      transaction.id,
    );

    if (currentAttempts.length > 0) {
      return currentAttempts;
    }

    try {
      await this.storage.transactionAttempts.createFromTransaction(transaction);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      if (!(await this.storage.transactionAttempts.existsByTransaction(transaction.id))) {
        throw error;
      }
    }

    return this.storage.transactionAttempts.listByTransaction(transaction.id);
  }
}
