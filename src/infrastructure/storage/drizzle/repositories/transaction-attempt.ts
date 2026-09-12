import { and, eq, isNull } from 'drizzle-orm';
import type { TransactionAttemptRepository } from '../../../../core/contracts/storage';
import type { TransactionAttemptRecord, TransactionRecord } from '../../../../domain/records';
import type {
  ListByTransactionOptions,
  TransactionAttemptChanges,
} from '../../../../domain/storage-types';
import type { PaymentRequest } from '../../../../domain/value-objects/payment-request';
import { paymentRequestToFormFields } from '../../../../domain/value-objects/payment-request';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { nowIso } from '../../knex/records';
import type { DrizzleRow } from '../client';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

export function makeTransactionAttemptRepository(
  context: RepositoryContext,
): TransactionAttemptRepository {
  const rows = () => gateway(context, 'transactionAttempts');

  function map(row: DrizzleRow): TransactionAttemptRecord {
    const normalized = normalizeRow('transactionAttempts', row);

    return {
      ...(normalized as unknown as TransactionAttemptRecord),
      payload: context.cipher.read(normalized.payload),
      callback_payload: context.cipher.read(normalized.callback_payload),
    };
  }

  async function findOrFail(id: number): Promise<TransactionAttemptRecord> {
    const row = await rows().first(eq(rows().column('id'), id));

    if (row === null) {
      throw new Error(`Transaction attempt ${id} not found.`);
    }

    return map(row);
  }

  async function nextAttemptNumber(transactionId: number): Promise<number> {
    const table = rows();
    const [latest] = await table.valuesOf(
      'attempt_number',
      eq(table.column('transaction_id'), transactionId),
      { orderBy: [table.descending('attempt_number')], limit: 1 },
    );

    return Number(latest ?? 0) + 1;
  }

  return {
    async createForPayment(
      transaction: TransactionRecord,
      paymentRequest: PaymentRequest,
      supersedeCurrent = false,
    ): Promise<TransactionAttemptRecord> {
      const attemptNumber = await nextAttemptNumber(transaction.id);
      const timestamp = nowIso();
      const table = rows();

      if (supersedeCurrent) {
        await table.update(
          and(
            eq(table.column('transaction_id'), transaction.id),
            isNull(table.column('superseded_at')),
          ),
          { superseded_at: timestamp, updated_at: timestamp },
        );
      }

      const id = await table.insertReturningId({
        transaction_id: transaction.id,
        attempt_number: attemptNumber,
        merchant_ref: paymentRequest.merchantRef,
        merchant_session: paymentRequest.merchantSession,
        status: 'pending',
        payload: context.cipher.store(paymentRequestToFormFields(paymentRequest)),
        submitted_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      });

      return findOrFail(id);
    },

    async createFromTransaction(transaction: TransactionRecord): Promise<TransactionAttemptRecord> {
      const attemptNumber = await nextAttemptNumber(transaction.id);
      const timestamp = nowIso();

      const id = await rows().insertReturningId({
        transaction_id: transaction.id,
        attempt_number: attemptNumber,
        merchant_ref: transaction.merchant_ref,
        merchant_session: transaction.merchant_session,
        status: transaction.status,
        gateway_transaction_id: transaction.transaction_id,
        message_type: transaction.message_type,
        response_code: transaction.response_code,
        merchant_response: transaction.merchant_response,
        fingerprint: transaction.fingerprint,
        payload: context.cipher.store(transaction.payload ?? null),
        submitted_at: transaction.created_at ?? timestamp,
        created_at: transaction.created_at ?? timestamp,
        updated_at: transaction.updated_at ?? timestamp,
      });

      return findOrFail(id);
    },

    async findByRefAndSession(
      merchantRef: string,
      merchantSession: string,
    ): Promise<TransactionAttemptRecord | null> {
      const table = rows();
      const row = await table.first(
        and(
          eq(table.column('merchant_ref'), merchantRef),
          eq(table.column('merchant_session'), merchantSession),
        ),
      );

      return row ? map(row) : null;
    },

    async findByRefAndSessionForUpdate(
      merchantRef: string,
      merchantSession: string,
    ): Promise<TransactionAttemptRecord | null> {
      const table = rows();
      const row = await table.firstForUpdate(
        and(
          eq(table.column('merchant_ref'), merchantRef),
          eq(table.column('merchant_session'), merchantSession),
        ),
      );

      return row ? map(row) : null;
    },

    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<TransactionAttemptRecord[]> {
      const table = rows();
      const found = await table.all(eq(table.column('transaction_id'), transactionId), {
        orderBy: [table.ordered('attempt_number', normalizeListOrder(options.order))],
        limit: normalizeListLimit(options.limit),
        offset: normalizeListOffset(options.offset),
      });

      return found.map(map);
    },

    async existsByTransaction(transactionId: number): Promise<boolean> {
      const table = rows();

      return table.exists(eq(table.column('transaction_id'), transactionId));
    },

    async currentByTransaction(transactionId: number): Promise<TransactionAttemptRecord | null> {
      const table = rows();
      const current = await table.first(
        and(
          eq(table.column('transaction_id'), transactionId),
          isNull(table.column('superseded_at')),
        ),
        { orderBy: [table.descending('id')] },
      );

      if (current !== null) {
        return map(current);
      }

      const latest = await table.first(eq(table.column('transaction_id'), transactionId), {
        orderBy: [table.descending('id')],
      });

      return latest ? map(latest) : null;
    },

    async update(
      id: number,
      changes: TransactionAttemptChanges,
    ): Promise<TransactionAttemptRecord> {
      const values: DrizzleRow = { ...changes, updated_at: nowIso() };

      if ('callback_payload' in changes) {
        values.callback_payload = context.cipher.store(changes.callback_payload ?? null);
      }

      await rows().update(eq(rows().column('id'), id), values);

      return findOrFail(id);
    },
  };
}
