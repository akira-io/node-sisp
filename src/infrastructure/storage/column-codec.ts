import type { EncryptedTableKey } from '../../core/contracts/maintenance';

export interface ColumnCodec {
  decode(stored: unknown): unknown;
  encode(value: unknown): unknown;
}

export const rawColumn: ColumnCodec = {
  decode: (stored) => stored,
  encode: (value) => value,
};

export const jsonTextColumn: ColumnCodec = {
  decode(stored) {
    if (typeof stored !== 'string') {
      return stored;
    }

    try {
      return JSON.parse(stored);
    } catch {
      return stored;
    }
  },
  encode(value) {
    return value === null || value === undefined ? null : JSON.stringify(value);
  },
};

export const jsonValueColumn: ColumnCodec = {
  decode: (stored) => jsonTextColumn.decode(stored),
  encode: (value) => value,
};

export type ColumnCodecTable = Partial<Record<EncryptedTableKey, Record<string, ColumnCodec>>>;

export function codecOf(
  codecs: ColumnCodecTable,
  table: EncryptedTableKey,
  column: string,
): ColumnCodec {
  return codecs[table]?.[column] ?? rawColumn;
}
