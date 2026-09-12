import { and, eq, isNull } from 'drizzle-orm';
import type { PaymentIntentRepository } from '../../../../core/contracts/storage';
import type { PaymentIntentRecord } from '../../../../domain/records';
import { isUniqueConstraintError } from '../../../../support/database-errors';
import { nowIso } from '../../knex/records';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

const MAX_FAILURE_REASON_LENGTH = 65_535;

export function makePaymentIntentRepository(context: RepositoryContext): PaymentIntentRepository {
  const rows = () => gateway(context, 'paymentIntents');

  return {
    async reserve(idempotencyKey: string, requestHash: string | null = null): Promise<boolean> {
      const table = rows();
      const timestamp = nowIso();
      const reclaimed = await table.update(
        and(
          eq(table.column('idempotency_key'), idempotencyKey),
          eq(table.column('status'), 'failed'),
          isNull(table.column('transaction_id')),
        ),
        {
          status: 'processing',
          request_hash: requestHash,
          transaction_id: null,
          failure_reason: null,
          updated_at: timestamp,
        },
      );

      if (reclaimed > 0) {
        return true;
      }

      try {
        await table.insert({
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
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
    },

    async findByKey(idempotencyKey: string): Promise<PaymentIntentRecord | null> {
      const table = rows();
      const row = await table.first(eq(table.column('idempotency_key'), idempotencyKey));

      return row ? (normalizeRow('paymentIntents', row) as unknown as PaymentIntentRecord) : null;
    },

    async submit(idempotencyKey: string, transactionId: number): Promise<void> {
      const table = rows();

      await table.update(eq(table.column('idempotency_key'), idempotencyKey), {
        transaction_id: transactionId,
        status: 'submitted',
        updated_at: nowIso(),
      });
    },

    async fail(
      idempotencyKey: string,
      reason: string,
      transactionId: number | null = null,
    ): Promise<void> {
      const table = rows();

      await table.update(eq(table.column('idempotency_key'), idempotencyKey), {
        transaction_id: transactionId,
        status: 'failed',
        failure_reason: reason.slice(0, MAX_FAILURE_REASON_LENGTH),
        updated_at: nowIso(),
      });
    },
  };
}
