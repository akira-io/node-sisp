import type { SQLiteColumn, SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { SispTables } from '../../../../application/config';
import type { ColumnReference, DialectSchemaBuilder } from './define';
import { defineSispSchema } from './define';
import type { ColumnSpec } from './spec';
import type { SispDrizzleSchema } from './types';
import { constrain, type Referencing } from './types';

function column(spec: ColumnSpec, reference: ColumnReference | null): SQLiteColumnBuilderBase {
  return withReference(build(spec), reference);
}

function build(spec: ColumnSpec): SQLiteColumnBuilderBase {
  switch (spec.type.kind) {
    case 'id':
      return integer(spec.name).primaryKey({ autoIncrement: true });
    case 'json':
      return constrain(text(spec.name, { mode: 'json' }), spec);
    case 'boolean':
      return constrain(integer(spec.name, { mode: 'boolean' }), spec);
    case 'bigint':
    case 'integer':
      return constrain(integer(spec.name), spec);
    case 'decimal':
      return constrain(real(spec.name), spec);
    default:
      return constrain(text(spec.name), spec);
  }
}

function withReference(
  built: SQLiteColumnBuilderBase,
  reference: ColumnReference | null,
): SQLiteColumnBuilderBase {
  if (reference === null) {
    return built;
  }

  return (built as unknown as Referencing<SQLiteColumnBuilderBase>).references(
    reference.resolve as never,
    { onDelete: reference.onDelete },
  );
}

const builder: DialectSchemaBuilder<SQLiteColumn, SQLiteColumnBuilderBase> = {
  column,
  table: (name, columns, extras) => sqliteTable(name, columns, (built) => extras(built) as never[]),
  index,
  uniqueIndex,
};

export function sqliteSispSchema(tables: SispTables): SispDrizzleSchema {
  return defineSispSchema(tables, builder);
}
