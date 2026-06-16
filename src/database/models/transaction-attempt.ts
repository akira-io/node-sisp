import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import { TransactionStatus } from '../../enums/transaction-status';
import type { CallbackPayload } from '../../value-objects/callback-payload';
import type { PaymentRequest } from '../../value-objects/payment-request';
import { paymentRequestToFormFields } from '../../value-objects/payment-request';
import type { PayloadCipher } from '../encryption';
import { lockForUpdate } from '../locking';
import { nowIso, type TransactionAttemptRecord, type TransactionRecord } from '../records';

export interface TransactionAttemptChanges {
  status: TransactionStatus;
  gateway_transaction_id?: string | null;
  message_type?: string | null;
  response_code?: string | null;
  merchant_response?: string | null;
  fingerprint?: string | null;
  callback_payload?: unknown;
  failure_reason?: string | null;
  callback_received_at?: string | null;
}

export class TransactionAttempt {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
    private readonly cipher: PayloadCipher,
  ) {}

  withConnection(connection: Knex): TransactionAttempt {
    return new TransactionAttempt(connection, this.tables, this.cipher);
  }

  async createForPayment(
    transaction: TransactionRecord,
    paymentRequest: PaymentRequest,
    supersedeCurrent = false,
  ): Promise<TransactionAttemptRecord> {
    const attemptNumber = await this.nextAttemptNumber(transaction.id);
    const timestamp = nowIso();

    if (supersedeCurrent) {
      await this.table()
        .where('transaction_id', transaction.id)
        .whereNull('superseded_at')
        .update({ superseded_at: timestamp, updated_at: timestamp });
    }

    const [id] = await this.table().insert(
      {
        transaction_id: transaction.id,
        attempt_number: attemptNumber,
        merchant_ref: paymentRequest.merchantRef,
        merchant_session: paymentRequest.merchantSession,
        status: 'pending',
        payload: this.cipher.store(paymentRequestToFormFields(paymentRequest)),
        submitted_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
      ['id'],
    );

    return this.findOrFail(extractId(id));
  }

  async createFromTransaction(transaction: TransactionRecord): Promise<TransactionAttemptRecord> {
    const attemptNumber = await this.nextAttemptNumber(transaction.id);
    const timestamp = nowIso();

    const [id] = await this.table().insert(
      {
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
        payload: this.cipher.store(transaction.payload ?? null),
        submitted_at: transaction.created_at ?? timestamp,
        created_at: transaction.created_at ?? timestamp,
        updated_at: transaction.updated_at ?? timestamp,
      },
      ['id'],
    );

    return this.findOrFail(extractId(id));
  }

  async findByRefAndSession(
    merchantRef: string,
    merchantSession: string,
  ): Promise<TransactionAttemptRecord | null> {
    const row = await this.table()
      .where('merchant_ref', merchantRef)
      .where('merchant_session', merchantSession)
      .first();

    return row ? this.map(row) : null;
  }

  async findByRefAndSessionForUpdate(
    merchantRef: string,
    merchantSession: string,
  ): Promise<TransactionAttemptRecord | null> {
    const query = this.table()
      .where('merchant_ref', merchantRef)
      .where('merchant_session', merchantSession);
    const row = await lockForUpdate(this.db, query).first();

    return row ? this.map(row) : null;
  }

  async listByTransaction(transactionId: number): Promise<TransactionAttemptRecord[]> {
    const rows = await this.table()
      .where('transaction_id', transactionId)
      .orderBy('attempt_number', 'asc');

    return rows.map((row: Record<string, unknown>) => this.map(row));
  }

  async update(id: number, changes: TransactionAttemptChanges): Promise<TransactionAttemptRecord> {
    const values: Record<string, unknown> = { ...changes, updated_at: nowIso() };

    if ('callback_payload' in changes) {
      values.callback_payload = this.cipher.store(changes.callback_payload ?? null);
    }

    await this.table().where('id', id).update(values);

    return this.findOrFail(id);
  }

  private async nextAttemptNumber(transactionId: number): Promise<number> {
    const row = await this.table()
      .where('transaction_id', transactionId)
      .max<{ max: number | string | null }>('attempt_number as max')
      .first();

    return Number(row?.max ?? 0) + 1;
  }

  private async findOrFail(id: number): Promise<TransactionAttemptRecord> {
    const row = await this.table().where('id', id).first();

    if (!row) {
      throw new Error(`Transaction attempt ${id} not found.`);
    }

    return this.map(row);
  }

  private map(row: Record<string, unknown>): TransactionAttemptRecord {
    return {
      ...(row as unknown as TransactionAttemptRecord),
      id: Number(row.id),
      transaction_id: Number(row.transaction_id),
      attempt_number: Number(row.attempt_number),
      payload: this.cipher.read(row.payload),
      callback_payload: this.cipher.read(row.callback_payload),
    };
  }

  private table(): Knex.QueryBuilder {
    return this.db(this.tables.transactionAttempts);
  }
}

export function isCurrentAttempt(attempt: TransactionAttemptRecord): boolean {
  return attempt.superseded_at === null;
}

export function shouldPropagateAttemptToTransaction(
  attempt: TransactionAttemptRecord,
  status: TransactionStatus,
): boolean {
  return isCurrentAttempt(attempt) || status === TransactionStatus.Completed;
}

function extractId(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return Number((value as { id: unknown }).id);
  }

  return Number(value);
}

export function attemptChangesFromCallback(
  payload: CallbackPayload,
  status: TransactionStatus,
  failureReason: string | null = null,
): TransactionAttemptChanges {
  return {
    status,
    gateway_transaction_id: String(payload.transactionID),
    message_type: payload.messageType,
    response_code: payload.merchantRespCp,
    merchant_response: failureReason ?? payload.merchantResponse,
    fingerprint: payload.fingerprint,
    callback_payload: payload,
    failure_reason: failureReason,
    callback_received_at: nowIso(),
  };
}
