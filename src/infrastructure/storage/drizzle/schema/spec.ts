import type { SispTables } from '../../../../application/config';
import { SISP_TABLE_SPECS } from './tables';

export { SISP_TABLE_SPECS } from './tables';

export type SispTableKey = keyof SispTables;

export const DEFAULT_STRING_LENGTH = 255;

export type ColumnType =
  | { kind: 'id' }
  | { kind: 'string'; length?: number }
  | { kind: 'text' }
  | { kind: 'longtext' }
  | { kind: 'bigint' }
  | { kind: 'integer' }
  | { kind: 'boolean' }
  | { kind: 'decimal'; precision: number; scale: number }
  | { kind: 'json' }
  | { kind: 'timestamp' }
  | { kind: 'date' };

export interface ColumnSpec {
  name: string;
  type: ColumnType;
  notNull?: boolean;
  default?: string | number | boolean;
  unique?: boolean;
  references?: { table: SispTableKey; onDelete: 'CASCADE' | 'SET NULL' };
}

export interface TableSpec {
  key: SispTableKey;
  columns: readonly ColumnSpec[];
  uniques: readonly (readonly string[])[];
  indexes: readonly (readonly string[])[];
}

export function tableSpec(key: SispTableKey): TableSpec {
  const spec = SISP_TABLE_SPECS.find((candidate) => candidate.key === key);

  if (spec === undefined) {
    throw new Error(`No SISP table spec for ${key}.`);
  }

  return spec;
}
