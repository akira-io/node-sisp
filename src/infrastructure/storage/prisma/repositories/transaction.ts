import type { SispTables } from '../../../../application/config';
import type { TransactionRepository } from '../../../../core/contracts/storage';
import type { TransactionRecord } from '../../../../domain/records';
import type {
  ListTransactionsOptions,
  NewTransaction,
  TransactionChanges,
} from '../../../../domain/storage-types';
import { fromCents, toCents } from '../../../../support/sisp-amount';
import type { PayloadCipher } from '../../knex/encryption';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { currentLogSource } from '../../knex/log-context';
import { nowIso } from '../../knex/records';
import { stableStringify } from '../../knex/models/transaction-row';
import {
  DELEGATE_NAMES,
  delegate,
  type PrismaClientLike,
  rawExec,
} from '../client';
import { lockRowForUpdate } from '../locking';
import { mapTransaction, newTransactionToData, type PrismaRow } from '../mapping';
import type { PrismaSqlProvider } from '../prisma-storage';
import { pruneTransactionLogs } from './log-pruning';

const MAPPED_COLUMNS: Record<string, string> = {
  transaction_id: 'transactionId',
  message_type: 'messageType',
  response_code: 'responseCode',
  merchant_response: 'merchantResponse',
  merchant_session: 'merchantSession',
  customer_name: 'customerName',
  customer_email: 'customerEmail',
  customer_phone: 'customerPhone',
  customer_country: 'customerCountry',
  customer_city: 'customerCity',
  customer_address: 'customerAddress',
  customer_postal_code: 'customerPostalCode',
  cancelled_at: 'cancelledAt',
  refunded_at: 'refundedAt',
  amount_cents: 'amountCents',
  fingerprint: 'fingerprint',
  status: 'status',
  payload: 'payload',
  locale: 'locale',
};

const DATE_COLUMNS = new Set(['cancelledAt', 'refundedAt']);

export function makeTransactionRepository(
  client: PrismaClientLike,
  tables: SispTables,
  cipher: PayloadCipher,
  provider: PrismaSqlProvider,
): TransactionRepository {
  const model = () => delegate(client, DELEGATE_NAMES.transactions);
  const logs = () => delegate(client, DELEGATE_NAMES.transactionLogs);

  async function findById(id: number): Promise<TransactionRecord | null> {
    const row = await model().findFirst({ where: { id: BigInt(id) } });

    return row ? mapTransaction(row, cipher) : null;
  }

  async function findOrFail(id: number): Promise<TransactionRecord> {
    const record = await findById(id);

    if (record === null) {
      throw new Error(`Transaction ${id} not found.`);
    }

    return record;
  }

  async function findByIdForUpdate(id: number): Promise<TransactionRecord | null> {
    await lockRowForUpdate(rawExec(client), provider, tables.transactions, 'id', id);

    return findById(id);
  }

  async function findOrFailForUpdate(id: number): Promise<TransactionRecord> {
    const record = await findByIdForUpdate(id);

    if (record === null) {
      throw new Error(`Transaction ${id} not found.`);
    }

    return record;
  }

  async function appendLog(
    transactionId: number,
    diff: { changed: string[]; oldValues: Record<string, unknown>; newValues: Record<string, unknown> },
  ): Promise<void> {
    const timestamp = nowIso();

    await logs().create({
      data: {
        transactionId: BigInt(transactionId),
        source: currentLogSource(),
        changedAttributes: diff.changed,
        oldValues: diff.oldValues,
        newValues: diff.newValues,
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      },
    });

    await pruneTransactionLogs(client, tables, transactionId);
  }

  return {
    async create(data: NewTransaction): Promise<TransactionRecord> {
      const timestamp = nowIso();
      const row = await model().create({
        data: newTransactionToData(data, cipher, timestamp),
      });

      return mapTransaction(row, cipher);
    },

    findById,
    findByIdForUpdate,

    async findByRefAndSession(merchantRef, merchantSession): Promise<TransactionRecord | null> {
      const row = await model().findFirst({
        where: { merchantRef, merchantSession },
      });

      return row ? mapTransaction(row, cipher) : null;
    },

    async findByRefAndSessionForUpdate(merchantRef, merchantSession) {
      await lockRowForUpdate(
        rawExec(client),
        provider,
        tables.transactions,
        'merchant_ref',
        merchantRef,
      );
      const row = await model().findFirst({ where: { merchantRef, merchantSession } });

      return row ? mapTransaction(row, cipher) : null;
    },

    async findByRef(merchantRef): Promise<TransactionRecord | null> {
      const row = await model().findFirst({ where: { merchantRef } });

      return row ? mapTransaction(row, cipher) : null;
    },

    async findByGatewayTransactionId(transactionId): Promise<TransactionRecord | null> {
      const row = await model().findFirst({ where: { transactionId } });

      return row ? mapTransaction(row, cipher) : null;
    },

    async list(options: ListTransactionsOptions = {}): Promise<TransactionRecord[]> {
      const where: Record<string, unknown> = {};

      if (options.status) {
        where.status = options.status;
      }

      const rows = await model().findMany({
        where,
        orderBy: { id: normalizeListOrder(options.order ?? 'desc') },
        take: normalizeListLimit(options.limit),
        skip: normalizeListOffset(options.offset),
      });

      return rows.map((row) => mapTransaction(row, cipher));
    },

    async listPendingForReconciliation(cutoffIso, limit): Promise<TransactionRecord[]> {
      const rows = await model().findMany({
        where: {
          status: 'pending',
          messageType: null,
          createdAt: { lte: new Date(cutoffIso) },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      return rows.map((row) => mapTransaction(row, cipher));
    },

    async update(id: number, changes: TransactionChanges): Promise<TransactionRecord> {
      return client.$transaction(async (txc) => {
        const scoped = makeTransactionRepository(txc, tables, cipher, provider);

        return (scoped as unknown as { updateLocked: typeof updateLocked }).updateLocked(id, changes);
      });
    },
  } as TransactionRepository & { updateLocked: typeof updateLocked };

  async function updateLocked(id: number, changes: TransactionChanges): Promise<TransactionRecord> {
    const current = await findOrFailForUpdate(id);
    const normalized = normalizeChanges(changes);
    const diff = computeDiff(current, normalized);

    if (diff.changed.length === 0) {
      return current;
    }

    await model().update({
      where: { id: BigInt(id) },
      data: { ...toWriteData(normalized, diff.changed, cipher), updatedAt: new Date(nowIso()) },
    });

    await appendLog(id, diff);

    return findOrFail(id);
  }
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

function computeDiff(
  current: TransactionRecord,
  normalized: Record<string, unknown>,
): { changed: string[]; oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const changed: string[] = [];
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [attribute, newValue] of Object.entries(normalized)) {
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

function toWriteData(
  normalized: Record<string, unknown>,
  changed: string[],
  cipher: PayloadCipher,
): PrismaRow {
  const data: PrismaRow = {};

  for (const attribute of changed) {
    if (attribute === 'amount') {
      continue;
    }

    const column = MAPPED_COLUMNS[attribute] ?? attribute;

    if (attribute === 'payload') {
      data[column] = cipher.store(normalized[attribute]);
      continue;
    }

    if (attribute === 'amount_cents') {
      data[column] = BigInt(toCents(normalized.amount as number | string));
      continue;
    }

    const value = normalized[attribute];

    data[column] = DATE_COLUMNS.has(column) && typeof value === 'string' ? new Date(value) : value;
  }

  return data;
}
