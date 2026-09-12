import type { SispTables } from '../../../application/config';
import { indexName, MYSQL_IDENTIFIER_LIMIT, uniqueName } from './schema/naming';
import type { ColumnSpec, ColumnType, TableSpec } from './schema/spec';
import { DEFAULT_STRING_LENGTH, SISP_TABLE_SPECS } from './schema/spec';

export type DrizzleDialect = 'postgresql' | 'mysql' | 'sqlite';

const COLUMN_TYPES: Record<DrizzleDialect, Record<ColumnType['kind'], string>> = {
  sqlite: {
    id: 'integer PRIMARY KEY AUTOINCREMENT',
    string: 'varchar',
    text: 'text',
    longtext: 'text',
    bigint: 'integer',
    integer: 'integer',
    boolean: 'integer',
    decimal: 'real',
    json: 'text',
    timestamp: 'text',
    date: 'text',
  },
  postgresql: {
    id: 'bigserial PRIMARY KEY',
    string: 'varchar',
    text: 'text',
    longtext: 'text',
    bigint: 'bigint',
    integer: 'integer',
    boolean: 'boolean',
    decimal: 'numeric',
    json: 'json',
    timestamp: 'timestamptz',
    date: 'date',
  },
  mysql: {
    id: 'bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY',
    string: 'varchar',
    text: 'text',
    longtext: 'longtext',
    bigint: 'bigint',
    integer: 'int',
    boolean: 'tinyint(1)',
    decimal: 'decimal',
    json: 'json',
    timestamp: 'datetime',
    date: 'date',
  },
};

function quote(identifier: string, dialect: DrizzleDialect): string {
  if (dialect === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

function identifierLimit(dialect: DrizzleDialect): number | undefined {
  return dialect === 'mysql' ? MYSQL_IDENTIFIER_LIMIT : undefined;
}

function columnType(spec: ColumnSpec, dialect: DrizzleDialect): string {
  const { type } = spec;
  const base = COLUMN_TYPES[dialect][type.kind];

  if (type.kind === 'string') {
    return `${base}(${type.length ?? DEFAULT_STRING_LENGTH})`;
  }

  if (type.kind === 'decimal' && dialect !== 'sqlite') {
    return `${base}(${type.precision}, ${type.scale})`;
  }

  if (type.kind === 'bigint' && dialect === 'mysql' && spec.references !== undefined) {
    return `${base} unsigned`;
  }

  return base;
}

function defaultLiteral(value: string | number | boolean, dialect: DrizzleDialect): string {
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === 'boolean') {
    return dialect === 'postgresql' ? String(value) : String(Number(value));
  }

  return String(value);
}

function columnDefinition(spec: ColumnSpec, tables: SispTables, dialect: DrizzleDialect): string {
  const parts = [quote(spec.name, dialect), columnType(spec, dialect)];

  if (spec.default !== undefined) {
    parts.push(`DEFAULT ${defaultLiteral(spec.default, dialect)}`);
  }

  if (spec.notNull === true) {
    parts.push('NOT NULL');
  }

  if (spec.unique === true) {
    parts.push('UNIQUE');
  }

  if (spec.references !== undefined && dialect !== 'mysql') {
    parts.push(foreignKeyClause(spec, tables, dialect));
  }

  return parts.join(' ');
}

function foreignKeyClause(spec: ColumnSpec, tables: SispTables, dialect: DrizzleDialect): string {
  const reference = spec.references as NonNullable<ColumnSpec['references']>;
  const target = quote(tables[reference.table], dialect);

  return `REFERENCES ${target}(${quote('id', dialect)}) ON DELETE ${reference.onDelete}`;
}

function mysqlForeignKeys(spec: TableSpec, table: string, tables: SispTables): string[] {
  return spec.columns
    .filter((column) => column.references !== undefined)
    .map((column) => {
      const name = quote(
        `${table}_${column.name}_foreign`.slice(0, MYSQL_IDENTIFIER_LIMIT),
        'mysql',
      );

      return `CONSTRAINT ${name} FOREIGN KEY (${quote(column.name, 'mysql')}) ${foreignKeyClause(column, tables, 'mysql')}`;
    });
}

function columnList(names: readonly string[], dialect: DrizzleDialect): string {
  return names.map((name) => quote(name, dialect)).join(', ');
}

function inlineMysqlIndexes(spec: TableSpec, table: string): string[] {
  const limit = MYSQL_IDENTIFIER_LIMIT;

  return [
    ...spec.uniques.map(
      (names) =>
        `UNIQUE KEY ${quote(uniqueName(table, names, limit), 'mysql')} (${columnList(names, 'mysql')})`,
    ),
    ...spec.indexes.map(
      (names) =>
        `KEY ${quote(indexName(table, names, limit), 'mysql')} (${columnList(names, 'mysql')})`,
    ),
  ];
}

function standaloneIndexes(spec: TableSpec, table: string, dialect: DrizzleDialect): string[] {
  const quoted = quote(table, dialect);
  const limit = identifierLimit(dialect);

  return [
    ...spec.uniques.map(
      (names) =>
        `CREATE UNIQUE INDEX IF NOT EXISTS ${quote(uniqueName(table, names, limit), dialect)} ON ${quoted} (${columnList(names, dialect)})`,
    ),
    ...spec.indexes.map(
      (names) =>
        `CREATE INDEX IF NOT EXISTS ${quote(indexName(table, names, limit), dialect)} ON ${quoted} (${columnList(names, dialect)})`,
    ),
  ];
}

export interface SispTablesDdl {
  tables: string[];
  indexes: string[];
}

function createTable(spec: TableSpec, tables: SispTables, dialect: DrizzleDialect): string[] {
  const table = tables[spec.key];
  const definitions = spec.columns.map((column) => columnDefinition(column, tables, dialect));
  const body =
    dialect === 'mysql'
      ? [
          ...definitions,
          ...inlineMysqlIndexes(spec, table),
          ...mysqlForeignKeys(spec, table, tables),
        ]
      : definitions;

  const create = `CREATE TABLE IF NOT EXISTS ${quote(table, dialect)} (\n  ${body.join(',\n  ')}\n)`;

  return dialect === 'mysql' ? [create] : [create, ...standaloneIndexes(spec, table, dialect)];
}

export function sispTablesDdl(tables: SispTables, dialect: DrizzleDialect): SispTablesDdl {
  return {
    tables: SISP_TABLE_SPECS.map((spec) => createTable(spec, tables, dialect)[0] as string),
    indexes:
      dialect === 'mysql'
        ? []
        : SISP_TABLE_SPECS.flatMap((spec) => standaloneIndexes(spec, tables[spec.key], dialect)),
  };
}

export function createSispTablesSql(
  tables: SispTables,
  dialect: DrizzleDialect,
): readonly string[] {
  const ddl = sispTablesDdl(tables, dialect);

  return [...ddl.tables, ...ddl.indexes];
}
