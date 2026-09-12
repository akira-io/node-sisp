import { describe, expect, it } from 'vitest';
import type { SispTables } from '../../../src/application/config';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { DrizzleDialect } from '../../../src/infrastructure/storage/drizzle';
import { createSispTablesSql } from '../../../src/infrastructure/storage/drizzle';
import { DIALECTS, introspect, TABLE_KEYS } from './schema-introspection';

const MAX_IDENTIFIER_LENGTH = 64;

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of body) {
    if (character === '(') {
      depth += 1;
    }

    if (character === ')') {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';

      continue;
    }

    current += character;
  }

  parts.push(current.trim());

  return parts.filter((part) => part !== '');
}

function statements(dialect: DrizzleDialect): string[] {
  return [...createSispTablesSql(DEFAULT_TABLES, dialect)];
}

function createTableFor(dialect: DrizzleDialect, table: string): string {
  const found = statements(dialect).find((statement) =>
    statement.startsWith(`CREATE TABLE IF NOT EXISTS ${quoted(dialect, table)} (`),
  );

  if (found === undefined) {
    throw new Error(`No CREATE TABLE for ${table} on ${dialect}.`);
  }

  return found;
}

function quoted(dialect: DrizzleDialect, identifier: string): string {
  return dialect === 'mysql' ? `\`${identifier}\`` : `"${identifier}"`;
}

function bodyOf(statement: string): string[] {
  const open = statement.indexOf('(');
  const close = statement.lastIndexOf(')');

  return splitTopLevel(statement.slice(open + 1, close));
}

function definedColumns(dialect: DrizzleDialect, table: string): string[] {
  return bodyOf(createTableFor(dialect, table))
    .filter((part) => !/^(UNIQUE KEY|KEY|CONSTRAINT)\b/.test(part))
    .map((part) => part.match(/^[`"]([^`"]+)[`"]/)?.[1] as string);
}

function declaredIndexes(dialect: DrizzleDialect, table: string): string[] {
  if (dialect === 'mysql') {
    return bodyOf(createTableFor(dialect, table))
      .filter((part) => /^(UNIQUE KEY|KEY)\b/.test(part))
      .map((part) => part.match(/[`]([^`]+)[`]/)?.[1] as string)
      .sort();
  }

  return statements(dialect)
    .filter((statement) => statement.includes(` ON ${quoted(dialect, table)} (`))
    .map((statement) => statement.match(/INDEX IF NOT EXISTS "([^"]+)"/)?.[1] as string)
    .sort();
}

describe('drizzle migrations', () => {
  it.each(DIALECTS)('emits a CREATE TABLE for every SISP table on %s', (dialect) => {
    const emitted = statements(dialect).filter((statement) => statement.startsWith('CREATE TABLE'));

    expect(emitted).toHaveLength(TABLE_KEYS.length);
  });

  it.each(
    DIALECTS.flatMap((dialect) => TABLE_KEYS.map((key) => [dialect, key] as const)),
  )('declares the schema columns in the %s DDL for %s', (dialect, key) => {
    const table = introspect(dialect, key);

    expect(definedColumns(dialect, DEFAULT_TABLES[key])).toEqual(
      table.columns.map((column) => column.name),
    );
  });

  it.each(
    DIALECTS.flatMap((dialect) => TABLE_KEYS.map((key) => [dialect, key] as const)),
  )('declares the schema indexes in the %s DDL for %s', (dialect, key) => {
    const table = introspect(dialect, key);

    expect(declaredIndexes(dialect, DEFAULT_TABLES[key])).toEqual(
      table.indexes.map((entry) => entry.name).sort(),
    );
  });

  it('keeps every MySQL index name within the identifier limit', () => {
    for (const key of TABLE_KEYS) {
      for (const name of declaredIndexes('mysql', DEFAULT_TABLES[key])) {
        expect(name.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
      }
    }
  });

  it('keeps the knex index name on Postgres and sqlite even past the MySQL limit', () => {
    const knexName = 'sisp_transactions_merchant_ref_merchant_session_status_message_type_index';

    expect(declaredIndexes('postgresql', DEFAULT_TABLES.transactions)).toContain(knexName);
    expect(declaredIndexes('sqlite', DEFAULT_TABLES.transactions)).toContain(knexName);
    expect(declaredIndexes('mysql', DEFAULT_TABLES.transactions)).not.toContain(knexName);
  });

  it('declares MySQL foreign keys as table constraints over unsigned columns', () => {
    const items = createTableFor('mysql', DEFAULT_TABLES.transactionItems);

    expect(items).toContain('`transaction_id` bigint unsigned');
    expect(items).toContain(
      'FOREIGN KEY (`transaction_id`) REFERENCES `' +
        DEFAULT_TABLES.transactions +
        '`(`id`) ON DELETE CASCADE',
    );
  });

  it('declares payload columns as longtext on MySQL only', () => {
    expect(createTableFor('mysql', DEFAULT_TABLES.transactions)).toContain('`payload` longtext');
    expect(createTableFor('mysql', DEFAULT_TABLES.transactionAttempts)).toContain(
      '`callback_payload` longtext',
    );
    expect(createTableFor('postgresql', DEFAULT_TABLES.transactions)).toContain('"payload" text');
    expect(createTableFor('sqlite', DEFAULT_TABLES.transactions)).toContain('"payload" text');
  });

  it('emits Postgres types for the columns whose storage differs by dialect', () => {
    const transactions = createTableFor('postgresql', DEFAULT_TABLES.transactions);
    const items = createTableFor('postgresql', DEFAULT_TABLES.transactionItems);
    const rateLimits = createTableFor('postgresql', DEFAULT_TABLES.rateLimits);
    const metadata = createTableFor('postgresql', DEFAULT_TABLES.requestMetadata);

    expect(transactions).toContain('"id" bigserial PRIMARY KEY');
    expect(transactions).toContain('"amount_cents" bigint');
    expect(transactions).toContain('"created_at" timestamptz');
    expect(items).toContain('"metadata" json');
    expect(rateLimits).toContain('"is_blocked" boolean DEFAULT false NOT NULL');
    expect(metadata).toContain('"latitude" numeric(10, 8)');
  });

  it('emits MySQL types for the columns whose storage differs by dialect', () => {
    const transactions = createTableFor('mysql', DEFAULT_TABLES.transactions);
    const items = createTableFor('mysql', DEFAULT_TABLES.transactionItems);
    const rateLimits = createTableFor('mysql', DEFAULT_TABLES.rateLimits);
    const metadata = createTableFor('mysql', DEFAULT_TABLES.requestMetadata);

    expect(transactions).toContain('`id` bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY');
    expect(transactions).toContain('`created_at` datetime');
    expect(items).toContain('`metadata` json');
    expect(rateLimits).toContain('`is_blocked` tinyint(1) DEFAULT 0 NOT NULL');
    expect(metadata).toContain('`latitude` decimal(10, 8)');
  });

  it('emits sqlite types for the columns whose storage differs by dialect', () => {
    const transactions = createTableFor('sqlite', DEFAULT_TABLES.transactions);
    const items = createTableFor('sqlite', DEFAULT_TABLES.transactionItems);
    const rateLimits = createTableFor('sqlite', DEFAULT_TABLES.rateLimits);

    expect(transactions).toContain('"id" integer PRIMARY KEY AUTOINCREMENT');
    expect(transactions).toContain('"created_at" text');
    expect(items).toContain('"metadata" text');
    expect(rateLimits).toContain('"is_blocked" integer DEFAULT 0 NOT NULL');
  });

  it('shortens a long MySQL index name but keeps it deterministic and unique', () => {
    const prefix = 'a_very_long_multi_tenant_table_name_prefix_';
    const tables: SispTables = { ...DEFAULT_TABLES };

    for (const key of Object.keys(tables) as (keyof SispTables)[]) {
      tables[key] = `${prefix}${tables[key]}`;
    }

    const emitted = [...createSispTablesSql(tables, 'mysql')];
    const names = emitted
      .flatMap((statement) => [...statement.matchAll(/(?:UNIQUE KEY|KEY) `([^`]+)`/g)])
      .map((match) => match[1] as string);

    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
    }

    expect(new Set(names).size).toBe(names.length);
    expect(createSispTablesSql(tables, 'mysql')).toEqual(emitted);
  });

  it('keeps custom table names in the foreign keys it emits', () => {
    const tables = { ...DEFAULT_TABLES, transactions: 'tenant_transactions' };
    const items = [...createSispTablesSql(tables, 'postgresql')].find((statement) =>
      statement.startsWith(`CREATE TABLE IF NOT EXISTS "${DEFAULT_TABLES.transactionItems}"`),
    );

    expect(items).toContain('REFERENCES "tenant_transactions"("id")');
  });

  it('points every foreign key at the transactions table', () => {
    const items = createTableFor('postgresql', DEFAULT_TABLES.transactionItems);
    const intents = createTableFor('postgresql', DEFAULT_TABLES.paymentIntents);

    expect(items).toContain(`REFERENCES "${DEFAULT_TABLES.transactions}"("id") ON DELETE CASCADE`);
    expect(intents).toContain(
      `REFERENCES "${DEFAULT_TABLES.transactions}"("id") ON DELETE SET NULL`,
    );
  });
});
