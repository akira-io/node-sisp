import type { Column } from 'drizzle-orm';
import type { SispTables } from '../../../../application/config';
import { indexName, uniqueName } from './naming';
import type { ColumnSpec, TableSpec } from './spec';
import { SISP_TABLE_SPECS } from './spec';
import type { SispDrizzleSchema, SispSchemaTable } from './types';
import { columnsOf } from './types';

interface IndexBuilder<TColumn> {
  on(...columns: [TColumn, ...TColumn[]]): unknown;
}

export interface ColumnReference {
  resolve(): Column;
  onDelete: 'cascade' | 'set null';
}

export interface DialectSchemaBuilder<TColumn, TColumnBuilder> {
  identifierLimit?: number;
  column(spec: ColumnSpec, reference: ColumnReference | null): TColumnBuilder;
  table(
    name: string,
    columns: Record<string, TColumnBuilder>,
    extras: (built: Record<string, unknown>) => unknown[],
  ): unknown;
  index(name: string): IndexBuilder<TColumn>;
  uniqueIndex(name: string): IndexBuilder<TColumn>;
}

const ON_DELETE = { CASCADE: 'cascade', 'SET NULL': 'set null' } as const;

function referenceFor(schema: SispDrizzleSchema, spec: ColumnSpec): ColumnReference | null {
  if (spec.references === undefined) {
    return null;
  }

  const target = spec.references.table;

  return {
    resolve: () => schema[target].id as Column,
    onDelete: ON_DELETE[spec.references.onDelete],
  };
}

function define<TColumn, TColumnBuilder>(
  spec: TableSpec,
  tables: SispTables,
  schema: SispDrizzleSchema,
  builder: DialectSchemaBuilder<TColumn, TColumnBuilder>,
): SispSchemaTable {
  const name = tables[spec.key];
  const limit = builder.identifierLimit;
  const columns = Object.fromEntries(
    spec.columns.map((column) => [
      column.name,
      builder.column(column, referenceFor(schema, column)),
    ]),
  );

  const table = builder.table(name, columns, (built) => [
    ...spec.uniques.map((names) =>
      builder.uniqueIndex(uniqueName(name, names, limit)).on(...columnsOf<TColumn>(built, names)),
    ),
    ...spec.indexes.map((names) =>
      builder.index(indexName(name, names, limit)).on(...columnsOf<TColumn>(built, names)),
    ),
  ]);

  return table as SispSchemaTable;
}

export function defineSispSchema<TColumn, TColumnBuilder>(
  tables: SispTables,
  builder: DialectSchemaBuilder<TColumn, TColumnBuilder>,
): SispDrizzleSchema {
  const schema = {} as SispDrizzleSchema;

  for (const spec of SISP_TABLE_SPECS) {
    schema[spec.key] = define(spec, tables, schema, builder);
  }

  return schema;
}
