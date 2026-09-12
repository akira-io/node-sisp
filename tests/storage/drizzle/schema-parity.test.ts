import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import { MYSQL_IDENTIFIER_LIMIT } from '../../../src/infrastructure/storage/drizzle/schema/naming';
import { SISP_TABLE_SPECS } from '../../../src/infrastructure/storage/drizzle/schema/spec';
import {
  DIALECTS,
  EXPECTED_SQL_TYPES,
  foreignKeyColumns,
  introspect,
  TABLE_KEYS,
} from './schema-introspection';

interface PrismaModel {
  table: string;
  columns: string[];
  uniques: string[][];
  indexes: string[][];
}

function parsePrisma(path: string): Record<string, PrismaModel> {
  const source = readFileSync(path, 'utf8');
  const models: Record<string, PrismaModel> = {};

  for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const body = match[2] as string;
    const columnOf: Record<string, string> = {};
    const columns: string[] = [];

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      const field = trimmed.match(/^(\w+)\s+\w+\??/);

      if (field === null || trimmed.startsWith('@@')) {
        continue;
      }

      const name = field[1] as string;
      const column = trimmed.match(/@map\("([^"]+)"\)/)?.[1] ?? name;

      columnOf[name] = column;
      columns.push(column);
    }

    const attribute = (kind: 'unique' | 'index'): string[][] =>
      [...body.matchAll(new RegExp(`^\\s*@@${kind}\\(\\[([^\\]]*)\\]\\)`, 'gm'))].map((entry) =>
        (entry[1] as string).split(',').map((field) => columnOf[field.trim()] as string),
      );

    const inlineUniques = [...body.matchAll(/^\s*(\w+)\s+\w+\??[^\n]*\s@unique/gm)].map((entry) => [
      columnOf[entry[1] as string] as string,
    ]);

    models[match[1] as string] = {
      table: body.match(/@@map\("([^"]+)"\)/)?.[1] ?? (match[1] as string),
      columns,
      uniques: [...attribute('unique'), ...inlineUniques],
      indexes: attribute('index'),
    };
  }

  return models;
}

function sortedKeys(entries: readonly (readonly string[])[]): string[] {
  return entries.map((entry) => entry.join(',')).sort();
}

const prismaModels = parsePrisma(resolve(__dirname, '../../../prisma/sisp.prisma'));
const prismaByTable = Object.fromEntries(
  Object.values(prismaModels).map((model) => [model.table, model]),
);

describe('drizzle schema parity', () => {
  it('declares a table for every SISP table name', () => {
    expect(TABLE_KEYS.map((key) => DEFAULT_TABLES[key]).sort()).toEqual(
      Object.keys(prismaByTable).sort(),
    );
  });

  it.each(TABLE_KEYS)('declares the same columns on every dialect for %s', (key) => {
    const [sqlite, postgres, mysql] = DIALECTS.map((dialect) =>
      introspect(dialect, key).columns.map(
        (column) => `${column.name} ${column.notNull} ${column.unique}`,
      ),
    );

    expect(postgres).toEqual(sqlite);
    expect(mysql).toEqual(sqlite);
  });

  it.each(TABLE_KEYS)('covers the same index columns on every dialect for %s', (key) => {
    const [sqlite, postgres, mysql] = DIALECTS.map((dialect) =>
      sortedKeys(
        introspect(dialect, key).indexes.map((entry) => [String(entry.unique), ...entry.columns]),
      ),
    );

    expect(postgres).toEqual(sqlite);
    expect(mysql).toEqual(sqlite);
  });

  it.each(TABLE_KEYS)('keeps the knex index names on sqlite and postgres for %s', (key) => {
    const [sqlite, postgres] = DIALECTS.map((dialect) =>
      introspect(dialect, key).indexes.map((entry) => entry.name),
    );

    expect(postgres).toEqual(sqlite);

    for (const entry of introspect('mysql', key).indexes) {
      expect(entry.name.length).toBeLessThanOrEqual(MYSQL_IDENTIFIER_LIMIT);
    }
  });

  it.each(SISP_TABLE_SPECS)('declares the spec foreign keys for $key', (spec) => {
    const expected = spec.columns
      .filter((column) => column.references !== undefined)
      .map((column) => column.name)
      .sort();

    for (const dialect of DIALECTS) {
      expect(foreignKeyColumns(dialect, spec.key)).toEqual(expected);
    }
  });

  it.each(
    DIALECTS.flatMap((dialect) => SISP_TABLE_SPECS.map((spec) => [dialect, spec] as const)),
  )('declares the spec types and nullability on %s for $key', (dialect, spec) => {
    const columns = new Map(
      introspect(dialect, spec.key).columns.map((column) => [column.name, column]),
    );

    for (const column of spec.columns) {
      const built = columns.get(column.name);

      expect(built).toBeDefined();
      expect(built?.sqlType).toBe(EXPECTED_SQL_TYPES[dialect](column));
      expect(built?.notNull).toBe(column.notNull === true || column.type.kind === 'id');
      expect(built?.unique).toBe(column.unique === true);
    }
  });

  it.each(SISP_TABLE_SPECS)('matches the canonical spec for $key', (spec) => {
    const table = introspect('sqlite', spec.key);

    expect(table.columns.map((column) => column.name)).toEqual(
      spec.columns.map((column) => column.name),
    );
    expect(
      sortedKeys(table.indexes.filter((entry) => entry.unique).map((entry) => entry.columns)),
    ).toEqual(sortedKeys(spec.uniques));
    expect(
      sortedKeys(table.indexes.filter((entry) => !entry.unique).map((entry) => entry.columns)),
    ).toEqual(sortedKeys(spec.indexes));
  });

  it.each(
    SISP_TABLE_SPECS,
  )('declares the columns the shipped Prisma schema declares for $key', (spec) => {
    const prisma = prismaByTable[DEFAULT_TABLES[spec.key]];

    expect(prisma).toBeDefined();
    expect(spec.columns.map((column) => column.name).sort()).toEqual(
      [...(prisma?.columns ?? [])].sort(),
    );
  });

  it.each(
    SISP_TABLE_SPECS,
  )('declares the constraints the shipped Prisma schema declares for $key', (spec) => {
    const prisma = prismaByTable[DEFAULT_TABLES[spec.key]];
    const specUniques = [
      ...spec.uniques,
      ...spec.columns.filter((column) => column.unique === true).map((column) => [column.name]),
    ];

    expect(sortedKeys(specUniques)).toEqual(sortedKeys(prisma?.uniques ?? []));
    expect(sortedKeys(spec.indexes)).toEqual(sortedKeys(prisma?.indexes ?? []));
  });
});
