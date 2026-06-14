import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import { createSispTables } from './create-sisp-tables';
import { createTransactionLogsTable } from './create-transaction-logs-table';

export interface SispMigration {
  name: string;
  up(db: Knex, tables: SispTables): Promise<void>;
}

export const SISP_MIGRATIONS: readonly SispMigration[] = [
  { name: '0001_create_sisp_tables', up: createSispTables },
  { name: '0002_create_transaction_logs_table', up: createTransactionLogsTable },
];
