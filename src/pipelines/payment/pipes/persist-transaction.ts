import type { Knex } from 'knex';
import type { BuildRequestPayloadAction } from '../../../actions/build-request-payload';
import type { ResolvedSispConfig } from '../../../config';
import type { PaymentPipe } from '../../../contracts/pipes';
import { runWithLogSource } from '../../../database/log-context';
import type { Invoice } from '../../../database/models/invoice';
import type { Transaction } from '../../../database/models/transaction';
import type { TransactionAttempt } from '../../../database/models/transaction-attempt';
import type { TransactionItem } from '../../../database/models/transaction-item';
import type { TransactionRecord } from '../../../database/records';
import {
  DuplicatePaymentIdentifierError,
  UnableToGenerateUniquePaymentIdentifiersError,
} from '../../../exceptions';
import { isUniqueConstraintError, sleep } from '../../../support/database-errors';
import { customerDataFrom, customerDataToRecord } from '../../../value-objects/customer-data';
import { paymentRequestToFormFields } from '../../../value-objects/payment-request';
import { transactionItemCollection } from '../../../value-objects/transaction-item-data';
import type { PaymentContext } from '../payment-context';

export class PersistTransaction implements PaymentPipe {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly db: Knex,
    private readonly transactions: Transaction,
    private readonly attempts: TransactionAttempt,
    private readonly items: TransactionItem,
    private readonly invoices: Invoice,
    private readonly buildRequestPayload: BuildRequestPayloadAction,
  ) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    const maxAttempts = Math.max(1, this.config.identifierGeneration.maxAttempts);
    let transaction: TransactionRecord | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        transaction = await this.persist(context);
        break;
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        if (attempt >= maxAttempts) {
          throw new UnableToGenerateUniquePaymentIdentifiersError(maxAttempts);
        }

        await sleep(this.config.identifierGeneration.collisionRetrySleepMs);
        context.paymentRequest = this.buildRequestPayload.handle(context.data);
      }
    }

    if (transaction === null) {
      throw new DuplicatePaymentIdentifierError('Unable to persist SISP payment identifiers.');
    }

    context.transaction = transaction;

    try {
      await this.invoices.createForTransaction(transaction);
    } catch {
      // Invoice stub creation must never break the payment flow.
    }

    await next();
  }

  private async persist(context: PaymentContext): Promise<TransactionRecord> {
    const paymentRequest = context.requirePaymentRequest();

    return this.db.transaction(async (trx) => {
      const transactions = this.transactions.withConnection(trx);
      const attempts = this.attempts.withConnection(trx);

      const created = await transactions.create({
        merchantRef: paymentRequest.merchantRef,
        merchantSession: paymentRequest.merchantSession,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        transactionCode: paymentRequest.transactionCode,
        payload: paymentRequestToFormFields(paymentRequest),
        locale: paymentRequest.locale,
      });

      await attempts.createForPayment(created, paymentRequest);

      const withCustomer = await runWithLogSource('customer-data', () =>
        transactions.update(
          created.id,
          customerDataToRecord(customerDataFrom(context.request.body)),
        ),
      );

      await this.items
        .withConnection(trx)
        .createMany(created.id, transactionItemCollection(itemsFromBody(context.request.body)));

      return withCustomer;
    });
  }
}

function itemsFromBody(body: Record<string, unknown>): readonly unknown[] {
  return Array.isArray(body.items) ? body.items : [];
}
