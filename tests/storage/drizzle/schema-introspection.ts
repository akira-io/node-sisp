import { getTableConfig as mysqlTableConfig } from 'drizzle-orm/mysql-core';
import { getTableConfig as pgTableConfig } from 'drizzle-orm/pg-core';
import { getTableConfig as sqliteTableConfig } from 'drizzle-orm/sqlite-core';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { DrizzleDialect } from '../../../src/infrastructure/storage/drizzle';
import {
  mysqlSispSchema,
  postgresSispSchema,
  sqliteSispSchema,
} from '../../../src/infrastructure/storage/drizzle';
import type {
  ColumnSpec,
  SispTableKey,
} from '../../../src/infrastructure/storage/drizzle/schema/spec';
import {
  DEFAULT_STRING_LENGTH,
  SISP_TABLE_SPECS,
} from '../../../src/infrastructure/storage/drizzle/schema/spec';

export interface IntrospectedColumn {
  name: string;
  sqlType: string;
  notNull: boolean;
  unique: boolean;
}

export interface IntrospectedIndex {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface IntrospectedTable {
  name: string;
  columns: IntrospectedColumn[];
  indexes: IntrospectedIndex[];
}

interface RawConfig {
  name: string;
  columns: { name: string; notNull: boolean; isUnique: boolean; getSQLType(): string }[];
  indexes: { config: { name: string; unique: boolean; columns: { name: string }[] } }[];
  foreignKeys: { reference(): { columns: { name: string }[] } }[];
}

const CONFIGS: Record<DrizzleDialect, (table: never) => unknown> = {
  sqlite: sqliteTableConfig as (table: never) => unknown,
  postgresql: pgTableConfig as (table: never) => unknown,
  mysql: mysqlTableConfig as (table: never) => unknown,
};

const SCHEMAS = {
  sqlite: sqliteSispSchema,
  postgresql: postgresSispSchema,
  mysql: mysqlSispSchema,
} as const;

export function foreignKeyColumns(dialect: DrizzleDialect, key: SispTableKey): string[] {
  return rawConfig(dialect, key)
    .foreignKeys.flatMap((entry) => entry.reference().columns.map((column) => column.name))
    .sort();
}

function rawConfig(dialect: DrizzleDialect, key: SispTableKey): RawConfig {
  const schema = SCHEMAS[dialect](DEFAULT_TABLES);

  return CONFIGS[dialect](schema[key] as never) as RawConfig;
}

export function introspect(dialect: DrizzleDialect, key: SispTableKey): IntrospectedTable {
  const config = rawConfig(dialect, key);

  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      unique: column.isUnique,
    })),
    indexes: config.indexes
      .map((entry) => ({
        name: entry.config.name,
        unique: entry.config.unique,
        columns: entry.config.columns.map((column) => column.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export const TABLE_KEYS: SispTableKey[] = SISP_TABLE_SPECS.map((spec) => spec.key);

export const DIALECTS: DrizzleDialect[] = ['sqlite', 'postgresql', 'mysql'];

type SqlTypeFor = (column: ColumnSpec) => string;

function stringLength(column: ColumnSpec): number {
  return column.type.kind === 'string' ? (column.type.length ?? DEFAULT_STRING_LENGTH) : 0;
}

function precision(column: ColumnSpec, separator: string): string {
  return column.type.kind === 'decimal'
    ? `${column.type.precision}${separator}${column.type.scale}`
    : '';
}

export const EXPECTED_SQL_TYPES: Record<DrizzleDialect, SqlTypeFor> = {
  sqlite: (column) => {
    switch (column.type.kind) {
      case 'decimal':
        return 'real';
      case 'id':
      case 'bigint':
      case 'integer':
      case 'boolean':
        return 'integer';
      default:
        return 'text';
    }
  },
  postgresql: (column) => {
    switch (column.type.kind) {
      case 'id':
        return 'bigserial';
      case 'bigint':
        return 'bigint';
      case 'integer':
        return 'integer';
      case 'boolean':
        return 'boolean';
      case 'decimal':
        return `numeric(${precision(column, ', ')})`;
      case 'json':
        return 'json';
      case 'timestamp':
        return 'timestamp with time zone';
      case 'date':
        return 'date';
      case 'text':
      case 'longtext':
        return 'text';
      default:
        return `varchar(${stringLength(column)})`;
    }
  },
  mysql: (column) => {
    switch (column.type.kind) {
      case 'id':
        return 'bigint unsigned';
      case 'bigint':
        return column.references === undefined ? 'bigint' : 'bigint unsigned';
      case 'integer':
        return 'int';
      case 'boolean':
        return 'boolean';
      case 'decimal':
        return `decimal(${precision(column, ',')})`;
      case 'json':
        return 'json';
      case 'timestamp':
        return 'datetime';
      case 'date':
        return 'date';
      case 'text':
      case 'longtext':
        return 'text';
      default:
        return `varchar(${stringLength(column)})`;
    }
  },
};
