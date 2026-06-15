import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import { nowIso } from '../records';

export async function createTransactionAttemptsTable(db: Knex, tables: SispTables): Promise<void> {
  await ensureNoDuplicateTransactionIdentifiers(db, tables);

  if (!(await db.schema.hasTable(tables.transactionAttempts))) {
    await db.schema.createTable(tables.transactionAttempts, (table) => {
      table.bigIncrements('id');
      table
        .bigInteger('transaction_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable(tables.transactions)
        .onDelete('CASCADE');
      table.integer('attempt_number').unsigned().notNullable();
      table.string('merchant_ref').notNullable();
      table.string('merchant_session').notNullable();
      table.string('status').notNullable().defaultTo('pending');
      table.string('gateway_transaction_id').nullable();
      table.string('message_type').nullable();
      table.string('response_code').nullable();
      table.text('merchant_response').nullable();
      table.text('fingerprint').nullable();
      table.text('payload', 'longtext').nullable();
      table.text('callback_payload', 'longtext').nullable();
      table.string('failure_reason').nullable();
      table.timestamp('submitted_at').nullable();
      table.timestamp('callback_received_at').nullable();
      table.timestamp('superseded_at').nullable();
      table.timestamps();
      table.unique(['merchant_session']);
      table.unique(['merchant_ref', 'merchant_session']);
      table.unique(['transaction_id', 'attempt_number']);
      table.index(['transaction_id', 'status']);
      table.index(['gateway_transaction_id']);
    });
  }

  await backfillAttempts(db, tables);
  await addMerchantReferenceUniqueIndex(db, tables);
}

async function ensureNoDuplicateTransactionIdentifiers(
  db: Knex,
  tables: SispTables,
): Promise<void> {
  const duplicateRef = await db(tables.transactions)
    .select('merchant_ref')
    .whereNotNull('merchant_ref')
    .groupBy('merchant_ref')
    .havingRaw('COUNT(*) > 1')
    .first();

  if (duplicateRef) {
    throw new Error(
      `Cannot add SISP merchant_ref uniqueness; duplicate merchant_ref [${duplicateRef.merchant_ref}] already exists.`,
    );
  }

  const duplicateSession = await db(tables.transactions)
    .select('merchant_session')
    .whereNotNull('merchant_session')
    .groupBy('merchant_session')
    .havingRaw('COUNT(*) > 1')
    .first();

  if (duplicateSession) {
    throw new Error(
      `Cannot backfill SISP attempts; duplicate merchant_session [${duplicateSession.merchant_session}] already exists.`,
    );
  }
}

async function backfillAttempts(db: Knex, tables: SispTables): Promise<void> {
  const existing = await db(tables.transactionAttempts)
    .count<{ count: number | string }>('id as count')
    .first();

  if (Number(existing?.count ?? 0) > 0) {
    return;
  }

  const transactions = await db(tables.transactions)
    .select([
      'id',
      'merchant_ref',
      'merchant_session',
      'status',
      'transaction_id',
      'message_type',
      'response_code',
      'merchant_response',
      'fingerprint',
      'payload',
      'created_at',
      'updated_at',
    ])
    .orderBy('id', 'asc');

  if (transactions.length === 0) {
    return;
  }

  const now = nowIso();

  await db(tables.transactionAttempts).insert(
    transactions.map((transaction) => ({
      transaction_id: transaction.id,
      attempt_number: 1,
      merchant_ref: transaction.merchant_ref,
      merchant_session: transaction.merchant_session,
      status: transaction.status,
      gateway_transaction_id: transaction.transaction_id,
      message_type: transaction.message_type,
      response_code: transaction.response_code,
      merchant_response: transaction.merchant_response,
      fingerprint: transaction.fingerprint,
      payload: transaction.payload,
      submitted_at: transaction.created_at,
      created_at: transaction.created_at ?? now,
      updated_at: transaction.updated_at ?? now,
    })),
  );
}

async function addMerchantReferenceUniqueIndex(db: Knex, tables: SispTables): Promise<void> {
  try {
    await db.schema.alterTable(tables.transactions, (table) => {
      table.unique(['merchant_ref']);
    });
  } catch (error) {
    if (
      !String((error as Error).message)
        .toLowerCase()
        .includes('already')
    ) {
      throw error;
    }
  }
}
