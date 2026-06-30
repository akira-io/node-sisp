import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import type { TransactionStatus } from '../../../../domain/enums/transaction-status';
import { fromCents, toCents } from '../../../../support/sisp-amount';
import type { PayloadCipher } from '../encryption';
import {
  type ListByTransactionOptions,
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../list-options';
import { lockForUpdate } from '../locking';
import { currentLogSource } from '../log-context';
import { nowIso, type TransactionRecord } from '../records';
import { pruneTransactionLogs } from '../transaction-log-pruning';
import { amountCentsFromRow, extractId, stableStringify } from './transaction-row';

export interface ListTransactionsOptions extends ListByTransactionOptions {
  status?: TransactionStatus;
}
export interface NewTransaction {
  merchantRef: string;
  merchantSession: string;
  amount: number | string;
  currency?: string;
  transactionCode?: string;
  payload?: unknown;
  locale?: string | null;
}

export interface TransactionChanges {
  amount?: number | string;
  status?: TransactionStatus;
  transaction_id?: string | null;
  message_type?: string | null;
  response_code?: string | null;
  merchant_response?: string | null;
  fingerprint?: string | null;
  payload?: unknown;
  merchant_session?: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_country?: string | null;
  customer_city?: string | null;
  customer_address?: string | null;
  customer_postal_code?: string | null;
  locale?: string;
  cancelled_at?: string | null;
  refunded_at?: string | null;
}

export class Transaction {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
    private readonly cipher: PayloadCipher,
  ) {}

  withConnection(connection: Knex): Transaction {
    return new Transaction(connection, this.tables, this.cipher);
  }

  async create(data: NewTransaction): Promise<TransactionRecord> {
    const timestamp = nowIso();

    const [id] = await this.table().insert(
      {
        merchant_ref: data.merchantRef,
        merchant_session: data.merchantSession,
        amount_cents: toCents(data.amount),
        currency: data.currency ?? '132',
        status: 'pending',
        transaction_code: data.transactionCode ?? '1',
        payload: this.cipher.store(data.payload ?? null),
        locale: data.locale ?? 'pt',
        created_at: timestamp,
        updated_at: timestamp,
      },
      ['id'],
    );

    return this.findOrFail(extractId(id));
  }

  async findById(id: number): Promise<TransactionRecord | null> {
    const row = await this.table().where('id', id).first();

    return row ? this.map(row) : null;
  }

  async findByIdForUpdate(id: number): Promise<TransactionRecord | null> {
    const row = await lockForUpdate(this.db, this.table().where('id', id)).first();

    return row ? this.map(row) : null;
  }

  async findByRefAndSession(
    merchantRef: string,
    merchantSession: string,
  ): Promise<TransactionRecord | null> {
    const row = await this.table()
      .where('merchant_ref', merchantRef)
      .where('merchant_session', merchantSession)
      .first();

    return row ? this.map(row) : null;
  }

  async findByRefAndSessionForUpdate(
    merchantRef: string,
    merchantSession: string,
  ): Promise<TransactionRecord | null> {
    const query = this.table()
      .where('merchant_ref', merchantRef)
      .where('merchant_session', merchantSession);
    const row = await lockForUpdate(this.db, query).first();

    return row ? this.map(row) : null;
  }

  async findByRef(merchantRef: string): Promise<TransactionRecord | null> {
    const row = await this.table().where('merchant_ref', merchantRef).first();

    return row ? this.map(row) : null;
  }

  async findByGatewayTransactionId(transactionId: string): Promise<TransactionRecord | null> {
    const row = await this.table().where('transaction_id', transactionId).first();

    return row ? this.map(row) : null;
  }

  async list(options: ListTransactionsOptions = {}): Promise<TransactionRecord[]> {
    const query = this.table();

    if (options.status) {
      query.where('status', options.status);
    }

    const rows = await query
      .orderBy('id', normalizeListOrder(options.order ?? 'desc'))
      .limit(normalizeListLimit(options.limit))
      .offset(normalizeListOffset(options.offset));

    return rows.map((row: Record<string, unknown>) => this.map(row));
  }

  async listPendingForReconciliation(
    cutoffIso: string,
    limit: number,
  ): Promise<TransactionRecord[]> {
    const rows = await this.table()
      .where('status', 'pending')
      .whereNull('message_type')
      .where('created_at', '<=', cutoffIso)
      .orderBy('created_at', 'asc')
      .limit(limit);

    return rows.map((row: Record<string, unknown>) => this.map(row));
  }

  async update(id: number, changes: TransactionChanges): Promise<TransactionRecord> {
    return this.db.transaction((trx) => this.withConnection(trx).updateLocked(id, changes));
  }

  private async updateLocked(id: number, changes: TransactionChanges): Promise<TransactionRecord> {
    const current = await this.findOrFailForUpdate(id);
    const normalizedChanges = this.normalizeChanges(changes);
    const diff = this.diff(current, normalizedChanges);

    if (diff.changed.length === 0) {
      return current;
    }

    await this.table()
      .where('id', id)
      .update({ ...this.toWriteValues(normalizedChanges, diff.changed), updated_at: nowIso() });

    await this.appendLog(id, diff);

    return this.findOrFail(id);
  }

  private async appendLog(
    transactionId: number,
    diff: {
      changed: string[];
      oldValues: Record<string, unknown>;
      newValues: Record<string, unknown>;
    },
  ): Promise<void> {
    const timestamp = nowIso();

    await this.db(this.tables.transactionLogs).insert({
      transaction_id: transactionId,
      source: currentLogSource(),
      changed_attributes: JSON.stringify(diff.changed),
      old_values: JSON.stringify(diff.oldValues),
      new_values: JSON.stringify(diff.newValues),
      created_at: timestamp,
      updated_at: timestamp,
    });

    await pruneTransactionLogs(this.db, this.tables, transactionId);
  }

  private normalizeChanges(changes: TransactionChanges): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...changes };

    if ('amount' in normalized) {
      const amountCents = toCents(changes.amount ?? 0);

      normalized.amount = fromCents(amountCents);
      normalized.amount_cents = amountCents;
    }

    return normalized;
  }

  private diff(
    current: TransactionRecord,
    normalizedChanges: Record<string, unknown>,
  ): { changed: string[]; oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
    const changed: string[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    for (const [attribute, newValue] of Object.entries(normalizedChanges)) {
      const oldValue = current[attribute as keyof TransactionRecord] ?? null;
      const normalizedNew = newValue ?? null;

      if (stableStringify(oldValue) === stableStringify(normalizedNew)) {
        continue;
      }

      changed.push(attribute);
      oldValues[attribute] = oldValue;
      newValues[attribute] = normalizedNew;
    }

    return { changed, oldValues, newValues };
  }

  private toWriteValues(
    normalizedChanges: Record<string, unknown>,
    changed: string[],
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    for (const attribute of changed) {
      if (attribute === 'amount') {
        continue;
      }

      values[attribute] =
        attribute === 'payload'
          ? this.cipher.store(normalizedChanges[attribute])
          : normalizedChanges[attribute];
    }

    return values;
  }

  private async findOrFail(id: number): Promise<TransactionRecord> {
    const record = await this.findById(id);

    if (record === null) {
      throw new Error(`Transaction ${id} not found.`);
    }

    return record;
  }

  private async findOrFailForUpdate(id: number): Promise<TransactionRecord> {
    const record = await this.findByIdForUpdate(id);

    if (record === null) {
      throw new Error(`Transaction ${id} not found.`);
    }

    return record;
  }

  private map(row: Record<string, unknown>): TransactionRecord {
    const amountCents = amountCentsFromRow(row);

    return {
      ...(row as unknown as TransactionRecord),
      id: Number(row.id),
      amount: fromCents(amountCents),
      amount_cents: amountCents,
      payload: this.cipher.read(row.payload),
    };
  }

  private table(): Knex.QueryBuilder {
    return this.db(this.tables.transactions);
  }
}
