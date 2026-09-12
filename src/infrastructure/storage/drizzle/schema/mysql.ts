import type { MySqlColumn, MySqlColumnBuilderBase } from 'drizzle-orm/mysql-core';
import {
  bigint,
  boolean,
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import type { SispTables } from '../../../../application/config';
import type { ColumnReference, DialectSchemaBuilder } from './define';
import { defineSispSchema } from './define';
import { MYSQL_IDENTIFIER_LIMIT } from './naming';
import type { ColumnSpec } from './spec';
import { DEFAULT_STRING_LENGTH } from './spec';
import type { SispDrizzleSchema } from './types';
import { constrain, type Referencing } from './types';

function column(spec: ColumnSpec, reference: ColumnReference | null): MySqlColumnBuilderBase {
  return withReference(build(spec, reference !== null), reference);
}

function build(spec: ColumnSpec, isForeignKey: boolean): MySqlColumnBuilderBase {
  switch (spec.type.kind) {
    case 'id':
      return bigint(spec.name, { mode: 'number', unsigned: true }).autoincrement().primaryKey();
    case 'json':
      return constrain(json(spec.name), spec);
    case 'boolean':
      return constrain(boolean(spec.name), spec);
    case 'bigint':
      return constrain(bigint(spec.name, { mode: 'number', unsigned: isForeignKey }), spec);
    case 'integer':
      return constrain(int(spec.name), spec);
    case 'decimal':
      return constrain(
        decimal(spec.name, { precision: spec.type.precision, scale: spec.type.scale }),
        spec,
      );
    case 'timestamp':
      return constrain(datetime(spec.name, { mode: 'date' }), spec);
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
  built: MySqlColumnBuilderBase,
  reference: ColumnReference | null,
): MySqlColumnBuilderBase {
  if (reference === null) {
    return built;
  }

  return (built as unknown as Referencing<MySqlColumnBuilderBase>).references(
    reference.resolve as never,
    { onDelete: reference.onDelete },
  );
}

const builder: DialectSchemaBuilder<MySqlColumn, MySqlColumnBuilderBase> = {
  identifierLimit: MYSQL_IDENTIFIER_LIMIT,
  column,
  table: (name, columns, extras) => mysqlTable(name, columns, (built) => extras(built) as never[]),
  index,
  uniqueIndex,
};

export function mysqlSispSchema(tables: SispTables): SispDrizzleSchema {
  return defineSispSchema(tables, builder);
}
