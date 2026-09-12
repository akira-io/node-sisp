import type { DrizzleRow } from './client';
import type { ColumnSpec, SispTableKey } from './schema/spec';
import { tableSpec } from './schema/spec';

function asIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

function coerce(value: unknown, spec: ColumnSpec): unknown {
  if (value === null || value === undefined) {
    return spec.type.kind === 'boolean' && spec.notNull === true ? false : null;
  }

  switch (spec.type.kind) {
    case 'id':
    case 'bigint':
    case 'integer':
    case 'decimal':
      return Number(value);
    case 'boolean':
      return Boolean(value);
    case 'timestamp':
      return asIso(value);
    case 'date':
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    default:
      return value;
  }
}

export function normalizeRow(key: SispTableKey, row: DrizzleRow): DrizzleRow {
  const normalized: DrizzleRow = { ...row };

  for (const column of tableSpec(key).columns) {
    if (column.name in row) {
      normalized[column.name] = coerce(row[column.name], column);
    }
  }

  return normalized;
}
