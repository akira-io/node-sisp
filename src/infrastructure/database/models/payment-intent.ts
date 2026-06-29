import type { Knex } from 'knex';
import type { SispTables } from '../../../application/config';
import { isUniqueConstraintError } from '../../../support/database-errors';
import { nowIso, type PaymentIntentRecord } from '../records';

export class PaymentIntent {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
  ) {}

  withConnection(connection: Knex): PaymentIntent {
    return new PaymentIntent(connection, this.tables);
  }

  async reserve(idempotencyKey: string): Promise<boolean> {
    const timestamp = nowIso();
    const reclaimed = await this.table()
      .where('idempotency_key', idempotencyKey)
      .where('status', 'failed')
      .whereNull('transaction_id')
      .update({
        status: 'processing',
        transaction_id: null,
        failure_reason: null,
        updated_at: timestamp,
      });

    if (reclaimed > 0) {
      return true;
    }

    try {
      await this.table().insert({
        idempotency_key: idempotencyKey,
        status: 'processing',
        created_at: timestamp,
        updated_at: timestamp,
      });

      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return false;
      }

      throw error;
    }
  }

  async findByKey(idempotencyKey: string): Promise<PaymentIntentRecord | null> {
    const row = await this.table().where('idempotency_key', idempotencyKey).first();

    return row ? this.map(row) : null;
  }

  async submit(idempotencyKey: string, transactionId: number): Promise<void> {
    await this.table().where('idempotency_key', idempotencyKey).update({
      transaction_id: transactionId,
      status: 'submitted',
      updated_at: nowIso(),
    });
  }

  async fail(
    idempotencyKey: string,
    reason: string,
    transactionId: number | null = null,
  ): Promise<void> {
    await this.table()
      .where('idempotency_key', idempotencyKey)
      .update({
        transaction_id: transactionId,
        status: 'failed',
        failure_reason: reason.slice(0, 65_535),
        updated_at: nowIso(),
      });
  }

  private map(row: Record<string, unknown>): PaymentIntentRecord {
    return {
      ...(row as unknown as PaymentIntentRecord),
      id: Number(row.id),
      transaction_id: row.transaction_id === null ? null : Number(row.transaction_id),
    };
  }

  private table(): Knex.QueryBuilder {
    return this.db(this.tables.paymentIntents);
  }
}
