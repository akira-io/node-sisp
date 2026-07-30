import type { Knex } from 'knex';
import type { CallbackOutcome } from '../../src/core/contracts/callback-verifier';
import type {
  CorrelationClaim,
  PaymentCorrelationStore,
} from '../../src/core/contracts/payment-correlation-store';
import type { PaymentRequest } from '../../src/domain/value-objects/payment-request';

export const CORRELATION_TABLE = 'sisp_playground_orders';

interface ClaimedRow {
  amount: string | number;
  currency: string;
  transaction_code: string;
}

export class KnexCorrelationStore implements PaymentCorrelationStore {
  constructor(
    private readonly db: Knex,
    private readonly table: string = CORRELATION_TABLE,
  ) {}

  async record(request: PaymentRequest): Promise<void> {
    await this.db(this.table).insert({
      merchant_ref: request.merchantRef,
      merchant_session: request.merchantSession,
      amount: request.amount,
      currency: request.currency,
      transaction_code: request.transactionCode,
      claimed_at: null,
      processed_verified: null,
      processed_reason: null,
    });
  }

  async claim(merchantRef: string, merchantSession: string): Promise<CorrelationClaim> {
    const claimed = (await this.db(this.table)
      .where({
        merchant_ref: merchantRef,
        merchant_session: merchantSession,
        claimed_at: null,
      })
      .update({ claimed_at: this.db.fn.now() })
      .returning(['amount', 'currency', 'transaction_code'])) as ClaimedRow[];

    if (claimed.length > 0) {
      const row = claimed[0] as ClaimedRow;

      return {
        status: 'claimed',
        payment: {
          amount: Number(row.amount),
          currency: row.currency,
          transactionCode: row.transaction_code,
        },
      };
    }

    const existing = await this.db(this.table)
      .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
      .first();

    return existing === undefined ? { status: 'missing' } : { status: 'already_processed' };
  }

  async markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void> {
    await this.db(this.table)
      .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
      .update({
        processed_verified: outcome.verified,
        processed_reason: outcome.reason,
      });
  }
}

export async function createCorrelationTable(db: Knex, table: string): Promise<void> {
  await db.schema.dropTableIfExists(table);
  await db.schema.createTable(table, (builder) => {
    builder.text('merchant_ref').notNullable();
    builder.text('merchant_session').notNullable();
    builder.decimal('amount').notNullable();
    builder.text('currency').notNullable();
    builder.text('transaction_code').notNullable();
    builder.timestamp('claimed_at', { useTz: true }).nullable();
    builder.boolean('processed_verified').nullable();
    builder.text('processed_reason').nullable();
    builder.primary(['merchant_ref', 'merchant_session']);
  });
}
