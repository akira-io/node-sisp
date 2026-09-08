import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import { addPaymentIntentRequestHash } from './add-payment-intent-request-hash';
import { addRateLimitUniqueIndex } from './add-rate-limit-unique-index';
import { addTransactionPosId } from './add-transaction-pos-id';
import { createPaymentIntentsTable } from './create-payment-intents-table';
import { createSispTables } from './create-sisp-tables';
import { createTransactionAttemptsTable } from './create-transaction-attempts-table';
import { createTransactionLogsTable } from './create-transaction-logs-table';

export interface SispMigration {
  name: string;
  up(db: Knex, tables: SispTables): Promise<void>;
}

export const SISP_MIGRATIONS: readonly SispMigration[] = [
  { name: '0001_create_sisp_tables', up: createSispTables },
  { name: '0002_create_transaction_logs_table', up: createTransactionLogsTable },
  { name: '0003_create_transaction_attempts_table', up: createTransactionAttemptsTable },
  { name: '0004_create_payment_intents_table', up: createPaymentIntentsTable },
  { name: '0005_add_rate_limit_unique_index', up: addRateLimitUniqueIndex },
  { name: '0006_add_payment_intent_request_hash', up: addPaymentIntentRequestHash },
  { name: '0007_add_transaction_pos_id', up: addTransactionPosId },
];
