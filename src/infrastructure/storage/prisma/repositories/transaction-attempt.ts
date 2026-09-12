import type { SispTables } from '../../../../application/config';
import type { TransactionAttemptRepository } from '../../../../core/contracts/storage';
import type { TransactionAttemptRecord, TransactionRecord } from '../../../../domain/records';
import type {
  ListByTransactionOptions,
  TransactionAttemptChanges,
} from '../../../../domain/storage-types';
import type { PaymentRequest } from '../../../../domain/value-objects/payment-request';
import { paymentRequestToFormFields } from '../../../../domain/value-objects/payment-request';
import type { PayloadCipher } from '../../knex/encryption';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { nowIso } from '../../knex/records';
import { DELEGATE_NAMES, delegate, type PrismaClientLike, rawExec } from '../client';
import { lockRowForUpdate } from '../locking';
import { mapTransactionAttempt } from '../mapping';
import type { PrismaSqlProvider } from '../prisma-storage';

const ATTEMPT_COLUMNS = {
  status: 'status',
  gateway_transaction_id: 'gatewayTransactionId',
  message_type: 'messageType',
  response_code: 'responseCode',
  merchant_response: 'merchantResponse',
  fingerprint: 'fingerprint',
  callback_payload: 'callbackPayload',
  failure_reason: 'failureReason',
  callback_received_at: 'callbackReceivedAt',
} satisfies Record<keyof TransactionAttemptChanges, string>;

type AttemptEncoder = (value: unknown, cipher: PayloadCipher) => unknown;

const ATTEMPT_ENCODERS: Partial<Record<keyof TransactionAttemptChanges, AttemptEncoder>> = {
  callback_payload: (value, cipher) => cipher.store(value),
  callback_received_at: (value) => (value === null ? null : new Date(value as string)),
};

export function makeTransactionAttemptRepository(
  client: PrismaClientLike,
  tables: SispTables,
  cipher: PayloadCipher,
  provider: PrismaSqlProvider,
): TransactionAttemptRepository {
  const model = () => delegate(client, DELEGATE_NAMES.transactionAttempts);

  async function findOrFail(id: number): Promise<TransactionAttemptRecord> {
    const row = await model().findFirst({ where: { id: BigInt(id) } });

    if (!row) {
      throw new Error(`Transaction attempt ${id} not found.`);
    }

    return mapTransactionAttempt(row, cipher);
  }

  async function nextAttemptNumber(transactionId: number): Promise<number> {
    const result = await model().aggregate({
      where: { transactionId: BigInt(transactionId) },
      _max: { attemptNumber: true },
    });

    const max = (result as Record<string, Record<string, unknown>>)._max?.attemptNumber;

    return Number(max ?? 0) + 1;
  }

  return {
    async createForPayment(
      transaction: TransactionRecord,
      paymentRequest: PaymentRequest,
      supersedeCurrent = false,
    ): Promise<TransactionAttemptRecord> {
      const attemptNumber = await nextAttemptNumber(transaction.id);
      const timestamp = nowIso();

      if (supersedeCurrent) {
        await model().updateMany({
          where: {
            transactionId: BigInt(transaction.id),
            supersededAt: null,
          },
          data: {
            supersededAt: new Date(timestamp),
            updatedAt: new Date(timestamp),
          },
        });
      }

      const row = await model().create({
        data: {
          transactionId: BigInt(transaction.id),
          attemptNumber,
          merchantRef: paymentRequest.merchantRef,
          merchantSession: paymentRequest.merchantSession,
          status: 'pending',
          payload: cipher.store(paymentRequestToFormFields(paymentRequest)),
          submittedAt: new Date(timestamp),
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
        },
      });

      return mapTransactionAttempt(row, cipher);
    },

    async createFromTransaction(transaction: TransactionRecord): Promise<TransactionAttemptRecord> {
      const attemptNumber = await nextAttemptNumber(transaction.id);
      const timestamp = nowIso();
      const submittedAt = transaction.created_at ?? timestamp;
      const createdAt = transaction.created_at ?? timestamp;
      const updatedAt = transaction.updated_at ?? timestamp;

      const row = await model().create({
        data: {
          transactionId: BigInt(transaction.id),
          attemptNumber,
          merchantRef: transaction.merchant_ref,
          merchantSession: transaction.merchant_session,
          status: transaction.status,
          gatewayTransactionId: transaction.transaction_id ?? null,
          messageType: transaction.message_type ?? null,
          responseCode: transaction.response_code ?? null,
          merchantResponse: transaction.merchant_response ?? null,
          fingerprint: transaction.fingerprint ?? null,
          payload: cipher.store(transaction.payload ?? null),
          submittedAt: new Date(submittedAt),
          createdAt: new Date(createdAt),
          updatedAt: new Date(updatedAt),
        },
      });

      return mapTransactionAttempt(row, cipher);
    },

    async findByRefAndSession(
      merchantRef: string,
      merchantSession: string,
    ): Promise<TransactionAttemptRecord | null> {
      const row = await model().findFirst({
        where: { merchantRef, merchantSession },
      });

      return row ? mapTransactionAttempt(row, cipher) : null;
    },

    async findByRefAndSessionForUpdate(
      merchantRef: string,
      merchantSession: string,
    ): Promise<TransactionAttemptRecord | null> {
      await lockRowForUpdate(rawExec(client), provider, tables.transactionAttempts, [
        { column: 'merchant_ref', value: merchantRef },
        { column: 'merchant_session', value: merchantSession },
      ]);

      const row = await model().findFirst({
        where: { merchantRef, merchantSession },
      });

      return row ? mapTransactionAttempt(row, cipher) : null;
    },

    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<TransactionAttemptRecord[]> {
      const rows = await model().findMany({
        where: { transactionId: BigInt(transactionId) },
        orderBy: { attemptNumber: normalizeListOrder(options.order) },
        take: normalizeListLimit(options.limit),
        skip: normalizeListOffset(options.offset),
      });

      return rows.map((row) => mapTransactionAttempt(row, cipher));
    },

    async existsByTransaction(transactionId: number): Promise<boolean> {
      const count = await model().count({
        where: { transactionId: BigInt(transactionId) },
      });

      return count > 0;
    },

    async currentByTransaction(transactionId: number): Promise<TransactionAttemptRecord | null> {
      const current = await model().findFirst({
        where: {
          transactionId: BigInt(transactionId),
          supersededAt: null,
        },
        orderBy: { id: 'desc' },
      });

      if (current) {
        return mapTransactionAttempt(current, cipher);
      }

      const latest = await model().findFirst({
        where: { transactionId: BigInt(transactionId) },
        orderBy: { id: 'desc' },
      });

      return latest ? mapTransactionAttempt(latest, cipher) : null;
    },

    async update(
      id: number,
      changes: TransactionAttemptChanges,
    ): Promise<TransactionAttemptRecord> {
      const data: Record<string, unknown> = { updatedAt: new Date(nowIso()) };

      for (const [field, column] of Object.entries(ATTEMPT_COLUMNS)) {
        if (!(field in changes)) {
          continue;
        }

        const key = field as keyof TransactionAttemptChanges;
        const value = changes[key] ?? null;
        const encode = ATTEMPT_ENCODERS[key];

        data[column] = encode === undefined ? value : encode(value, cipher);
      }

      await model().update({
        where: { id: BigInt(id) },
        data,
      });

      return findOrFail(id);
    },
  };
}
