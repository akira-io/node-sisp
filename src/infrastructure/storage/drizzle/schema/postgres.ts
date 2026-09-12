import type { PgColumn, PgColumnBuilderBase } from 'drizzle-orm/pg-core';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  json,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import type { SispTables } from '../../../../application/config';
import type { ColumnReference, DialectSchemaBuilder } from './define';
import { defineSispSchema } from './define';
import type { ColumnSpec } from './spec';
import { DEFAULT_STRING_LENGTH } from './spec';
import type { SispDrizzleSchema } from './types';
import { constrain, type Referencing } from './types';

function column(spec: ColumnSpec, reference: ColumnReference | null): PgColumnBuilderBase {
  return withReference(build(spec), reference);
}

function build(spec: ColumnSpec): PgColumnBuilderBase {
  switch (spec.type.kind) {
    case 'id':
      return bigserial(spec.name, { mode: 'number' }).primaryKey();
    case 'json':
      return constrain(json(spec.name), spec);
    case 'boolean':
      return constrain(boolean(spec.name), spec);
    case 'bigint':
      return constrain(bigint(spec.name, { mode: 'number' }), spec);
    case 'integer':
      return constrain(integer(spec.name), spec);
    case 'decimal':
      return constrain(
        numeric(spec.name, { precision: spec.type.precision, scale: spec.type.scale }),
        spec,
      );
    case 'timestamp':
      return constrain(timestamp(spec.name, { withTimezone: true, mode: 'date' }), spec);
    case 'date':
      return constrain(date(spec.name, { mode: 'string' }), spec);
    case 'text':
    case 'longtext':
      return constrain(text(spec.name), spec);
    default:
      return constrain(
        varchar(spec.name, { length: spec.type.length ?? DEFAULT_STRING_LENGTH }),
        spec,
      );
  }
}

function withReference(
  built: PgColumnBuilderBase,
  reference: ColumnReference | null,
): PgColumnBuilderBase {
  if (reference === null) {
    return built;
  }

  return (built as unknown as Referencing<PgColumnBuilderBase>).references(
    reference.resolve as never,
    { onDelete: reference.onDelete },
  );
}

const builder: DialectSchemaBuilder<PgColumn, PgColumnBuilderBase> = {
  column,
  table: (name, columns, extras) => pgTable(name, columns, (built) => extras(built) as never[]),
  index,
  uniqueIndex,
};

export function postgresSispSchema(tables: SispTables): SispDrizzleSchema {
  return defineSispSchema(tables, builder);
}
