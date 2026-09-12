import type { Column, Table } from 'drizzle-orm';
import type { ColumnSpec, SispTableKey } from './spec';

export type SispSchemaTable = Table & Record<string, Column>;

export type SispDrizzleSchema = Record<SispTableKey, SispSchemaTable>;

export interface Referencing<TBuilder> {
  references(resolve: never, actions: { onDelete: 'cascade' | 'set null' }): TBuilder;
}

interface Constrainable {
  notNull(): Constrainable;
  unique(): Constrainable;
  default(value: unknown): Constrainable;
}

export function constrain<TBuilder>(builder: TBuilder, spec: ColumnSpec): TBuilder {
  let built = builder as Constrainable;

  if (spec.default !== undefined) {
    built = built.default(spec.default);
  }

  if (spec.notNull === true) {
    built = built.notNull();
  }

  if (spec.unique === true) {
    built = built.unique();
  }

  return built as TBuilder;
}

export function columnsOf<TColumn>(
  table: Record<string, unknown>,
  names: readonly string[],
): [TColumn, ...TColumn[]] {
  const columns = names.map((name) => {
    const column = table[name];

    if (column === undefined) {
      throw new Error(`No column ${name} on the SISP table definition.`);
    }

    return column as TColumn;
  });

  const [first, ...rest] = columns;

  if (first === undefined) {
    throw new Error('An index needs at least one column.');
  }

  return [first, ...rest];
}
