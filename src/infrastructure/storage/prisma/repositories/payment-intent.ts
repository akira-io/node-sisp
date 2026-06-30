import type { SispTables } from '../../../../application/config';
import type { PaymentIntentRepository } from '../../../../core/contracts/storage';
import type { PaymentIntentRecord } from '../../../../domain/records';
import { isUniqueConstraintError } from '../../../../support/database-errors';
import { nowIso } from '../../knex/records';
import { DELEGATE_NAMES, delegate, type PrismaClientLike } from '../client';
import { mapPaymentIntent } from '../mapping';

export function makePaymentIntentRepository(
  client: PrismaClientLike,
  _tables: SispTables,
): PaymentIntentRepository {
  const model = () => delegate(client, DELEGATE_NAMES.paymentIntents);

  return {
    async reserve(idempotencyKey: string): Promise<boolean> {
      const timestamp = nowIso();

      const reclaimed = await model().updateMany({
        where: {
          idempotencyKey,
          status: 'failed',
          transactionId: null,
        },
        data: {
          status: 'processing',
          transactionId: null,
          failureReason: null,
          updatedAt: new Date(timestamp),
        },
      });

      if (reclaimed.count > 0) {
        return true;
      }

      try {
        await model().create({
          data: {
            idempotencyKey,
            status: 'processing',
            createdAt: new Date(timestamp),
            updatedAt: new Date(timestamp),
          },
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
      const row = await model().findFirst({ where: { idempotencyKey } });

      return row ? mapPaymentIntent(row) : null;
    },

    async submit(idempotencyKey: string, transactionId: number): Promise<void> {
      await model().updateMany({
        where: { idempotencyKey },
        data: {
          transactionId: BigInt(transactionId),
          status: 'submitted',
          updatedAt: new Date(nowIso()),
        },
      });
    },

    async fail(
      idempotencyKey: string,
      reason: string,
      transactionId: number | null = null,
    ): Promise<void> {
      await model().updateMany({
        where: { idempotencyKey },
        data: {
          transactionId: transactionId !== null ? BigInt(transactionId) : null,
          status: 'failed',
          failureReason: reason.slice(0, 65_535),
          updatedAt: new Date(nowIso()),
        },
      });
    },
  };
}
