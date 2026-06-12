import type { Knex } from 'knex';
import type { PaymentPipe } from '../../../contracts/pipes';
import { runWithLogSource } from '../../../database/log-context';
import type { InvoiceRepository } from '../../../database/models/invoice-repository';
import type { TransactionItemRepository } from '../../../database/models/transaction-item-repository';
import type { TransactionRepository } from '../../../database/models/transaction-repository';
import { paymentRequestToFormFields } from '../../../value-objects/payment-request';
import { customerDataFrom, customerDataToRecord } from '../../../value-objects/customer-data';
import { transactionItemCollection } from '../../../value-objects/transaction-item-data';
import type { PaymentContext } from '../payment-context';

export class PersistTransaction implements PaymentPipe {
  constructor(
    private readonly db: Knex,
    private readonly transactions: TransactionRepository,
    private readonly items: TransactionItemRepository,
    private readonly invoices: InvoiceRepository,
  ) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    const paymentRequest = context.requirePaymentRequest();

    const transaction = await this.db.transaction(async (trx) => {
      const transactions = this.transactions.withConnection(trx);

      const created = await transactions.create({
        merchantRef: paymentRequest.merchantRef,
        merchantSession: paymentRequest.merchantSession,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        transactionCode: paymentRequest.transactionCode,
        payload: paymentRequestToFormFields(paymentRequest),
        locale: paymentRequest.locale,
      });

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

    context.transaction = transaction;

    try {
      await this.invoices.createForTransaction(transaction);
    } catch {
      // Invoice stub creation must never break the payment flow.
    }

    await next();
  }
}

function itemsFromBody(body: Record<string, unknown>): readonly unknown[] {
  return Array.isArray(body.items) ? body.items : [];
}
