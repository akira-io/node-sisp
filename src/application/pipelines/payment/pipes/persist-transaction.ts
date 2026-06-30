import type { PaymentPipe } from '../../../../core/contracts/pipes';
import type { SispStorage } from '../../../../core/contracts/storage';
import {
  DuplicatePaymentIdentifierError,
  UnableToGenerateUniquePaymentIdentifiersError,
} from '../../../../domain/errors/exceptions';
import {
  customerDataFrom,
  customerDataToRecord,
} from '../../../../domain/value-objects/customer-data';
import { paymentRequestToFormFields } from '../../../../domain/value-objects/payment-request';
import { transactionItemCollection } from '../../../../domain/value-objects/transaction-item-data';
import { runWithLogSource } from '../../../../infrastructure/storage/knex/log-context';
import type { TransactionRecord } from '../../../../infrastructure/storage/knex/records';
import { isUniqueConstraintError, sleep } from '../../../../support/database-errors';
import type { BuildRequestPayloadAction } from '../../../actions/build-request-payload';
import type { ResolvedSispConfig } from '../../../config';
import type { PaymentContext } from '../payment-context';

export class PersistTransaction implements PaymentPipe {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly storage: SispStorage,
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
      await this.storage.invoices.createForTransaction(transaction);
    } catch {
      // Invoice stub creation must never break the payment flow.
    }

    await next();
  }

  private async persist(context: PaymentContext): Promise<TransactionRecord> {
    const paymentRequest = context.requirePaymentRequest();

    return this.storage.transaction(async (tx) => {
      const created = await tx.transactions.create({
        merchantRef: paymentRequest.merchantRef,
        merchantSession: paymentRequest.merchantSession,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        transactionCode: paymentRequest.transactionCode,
        payload: paymentRequestToFormFields(paymentRequest),
        locale: paymentRequest.locale,
      });

      await tx.transactionAttempts.createForPayment(created, paymentRequest);

      const withCustomer = await runWithLogSource('customer-data', () =>
        tx.transactions.update(
          created.id,
          customerDataToRecord(customerDataFrom(context.request.body)),
        ),
      );

      await tx.transactionItems.createMany(
        created.id,
        transactionItemCollection(itemsFromBody(context.request.body)),
      );

      return withCustomer;
    });
  }
}

function itemsFromBody(body: Record<string, unknown>): readonly unknown[] {
  return Array.isArray(body.items) ? body.items : [];
}
