import { and, eq, isNull, lte } from 'drizzle-orm';
import type { TransactionRepository } from '../../../../core/contracts/storage';
import type { TransactionRecord } from '../../../../domain/records';
import type {
  ListTransactionsOptions,
  NewTransaction,
  TransactionChanges,
} from '../../../../domain/storage-types';
import { fromCents, toCents } from '../../../../support/sisp-amount';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { currentLogSource } from '../../knex/log-context';
import { amountCentsFromRow, stableStringify } from '../../knex/models/transaction-row';
import { nowIso } from '../../knex/records';
import type { DrizzleRow } from '../client';
import { runInTransaction } from '../client';
import { normalizeRow } from '../mapping';
import type { TableGateway } from '../queries';
import type { RepositoryContext } from './context';
import { gateway, scopedContext } from './context';
import { pruneTransactionLogs } from './transaction-log-pruning';

interface Diff {
  changed: string[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

export function makeTransactionRepository(context: RepositoryContext): TransactionRepository {
  const rows = (): TableGateway => gateway(context, 'transactions');

  function map(row: DrizzleRow): TransactionRecord {
    const normalized = normalizeRow('transactions', row);
    const amountCents = amountCentsFromRow(normalized);

    return {
      ...(normalized as unknown as TransactionRecord),
      amount: fromCents(amountCents),
      amount_cents: amountCents,
      payload: context.cipher.read(normalized.payload),
    };
  }

  async function findById(id: number): Promise<TransactionRecord | null> {
    const row = await rows().first(eq(rows().column('id'), id));

    return row ? map(row) : null;
  }

  async function findOrFail(id: number): Promise<TransactionRecord> {
    const record = await findById(id);

    if (record === null) {
      throw new Error(`Transaction ${id} not found.`);
    }

    return record;
  }

  function normalizeChanges(changes: TransactionChanges): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...changes };

    if ('amount' in normalized) {
      const amountCents = toCents(changes.amount ?? 0);

      normalized.amount = fromCents(amountCents);
      normalized.amount_cents = amountCents;
    }

    return normalized;
  }

  function logValue(attribute: string, value: unknown): unknown {
    return attribute === 'payload' ? context.cipher.store(value) : value;
  }

  function diff(current: TransactionRecord, changes: Record<string, unknown>): Diff {
    const changed: string[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    for (const [attribute, newValue] of Object.entries(changes)) {
      const oldValue = current[attribute as keyof TransactionRecord] ?? null;
      const normalizedNew = newValue ?? null;

      if (stableStringify(oldValue) === stableStringify(normalizedNew)) {
        continue;
      }

      changed.push(attribute);
      oldValues[attribute] = logValue(attribute, oldValue);
      newValues[attribute] = logValue(attribute, normalizedNew);
    }

    return { changed, oldValues, newValues };
  }

  function toWriteValues(changes: Record<string, unknown>, changed: string[]): DrizzleRow {
    const values: DrizzleRow = {};

    for (const attribute of changed) {
      if (attribute === 'amount') {
        continue;
      }

      values[attribute] =
        attribute === 'payload' ? context.cipher.store(changes[attribute]) : changes[attribute];
    }

    return values;
  }

  async function appendLog(
    scoped: RepositoryContext,
    transactionId: number,
    changes: Diff,
  ): Promise<void> {
    const timestamp = nowIso();

    await gateway(scoped, 'transactionLogs').insert({
      transaction_id: transactionId,
      source: currentLogSource(),
      changed_attributes: changes.changed,
      old_values: changes.oldValues,
      new_values: changes.newValues,
      created_at: timestamp,
      updated_at: timestamp,
    });

    await pruneTransactionLogs(scoped, transactionId);
  }

  return {
    async create(data: NewTransaction): Promise<TransactionRecord> {
      const timestamp = nowIso();
      const id = await rows().insertReturningId({
        merchant_ref: data.merchantRef,
        merchant_session: data.merchantSession,
        pos_id: data.posId ?? null,
        amount_cents: toCents(data.amount),
        currency: data.currency ?? '132',
        status: 'pending',
        transaction_code: data.transactionCode ?? '1',
        payload: context.cipher.store(data.payload ?? null),
        locale: data.locale ?? 'pt',
        created_at: timestamp,
        updated_at: timestamp,
      });

      return findOrFail(id);
    },

    findById,

    async findByIdForUpdate(id: number): Promise<TransactionRecord | null> {
      const row = await rows().firstForUpdate(eq(rows().column('id'), id));

      return row ? map(row) : null;
    },

    async findByRefAndSession(
      merchantRef: string,
      merchantSession: string,
    ): Promise<TransactionRecord | null> {
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
    ): Promise<TransactionRecord | null> {
      const table = rows();
      const row = await table.firstForUpdate(
        and(
          eq(table.column('merchant_ref'), merchantRef),
          eq(table.column('merchant_session'), merchantSession),
        ),
      );

      return row ? map(row) : null;
    },

    async findByRef(merchantRef: string): Promise<TransactionRecord | null> {
      const row = await rows().first(eq(rows().column('merchant_ref'), merchantRef));

      return row ? map(row) : null;
    },

    async findByGatewayTransactionId(transactionId: string): Promise<TransactionRecord | null> {
      const row = await rows().first(eq(rows().column('transaction_id'), transactionId));

      return row ? map(row) : null;
    },

    async list(options: ListTransactionsOptions = {}): Promise<TransactionRecord[]> {
      const table = rows();
      const found = await table.all(
        options.status ? eq(table.column('status'), options.status) : undefined,
        {
          orderBy: [table.ordered('id', normalizeListOrder(options.order ?? 'desc'))],
          limit: normalizeListLimit(options.limit),
          offset: normalizeListOffset(options.offset),
        },
      );

      return found.map(map);
    },

    async listPendingForReconciliation(
      cutoffIso: string,
      limit: number,
    ): Promise<TransactionRecord[]> {
      const table = rows();
      const found = await table.all(
        and(
          eq(table.column('status'), 'pending'),
          isNull(table.column('message_type')),
          lte(table.column('created_at'), table.timestampValue(cutoffIso)),
        ),
        { orderBy: [table.ascending('created_at')], limit },
      );

      return found.map(map);
    },

    async update(id: number, changes: TransactionChanges): Promise<TransactionRecord> {
      return runInTransaction(context.connection, async (connection) => {
        const scoped = scopedContext(context, connection);
        const scopedRows = gateway(scoped, 'transactions');
        const locked = await scopedRows.firstForUpdate(eq(scopedRows.column('id'), id));

        if (locked === null) {
          throw new Error(`Transaction ${id} not found.`);
        }

        const current = map(locked);
        const normalized = normalizeChanges(changes);
        const changeSet = diff(current, normalized);

        if (changeSet.changed.length === 0) {
          return current;
        }

        await scopedRows.update(eq(scopedRows.column('id'), id), {
          ...toWriteValues(normalized, changeSet.changed),
          updated_at: nowIso(),
        });

        await appendLog(scoped, id, changeSet);

        const updated = await scopedRows.first(eq(scopedRows.column('id'), id));

        if (updated === null) {
          throw new Error(`Transaction ${id} not found.`);
        }

        return map(updated);
      });
    },
  };
}
