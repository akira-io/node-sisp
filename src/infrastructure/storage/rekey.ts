import type { EncryptedColumn } from '../../core/contracts/maintenance';
import { isEncrypted, type PayloadCipher } from './knex/encryption';

export type RekeyOutcome =
  | { status: 'current' }
  | { status: 'plaintext' }
  | { status: 'rewritten'; value: unknown }
  | { status: 'unreadable'; reason: string };

export interface RekeyChange {
  column: EncryptedColumn;
  value: unknown;
}

export interface RekeyFailure {
  column: string;
  reason: string;
}

export interface RowRekey {
  changes: readonly RekeyChange[];
  failures: readonly RekeyFailure[];
  plaintext: number;
}

const CURRENT: RekeyOutcome = { status: 'current' };
const PLAINTEXT: RekeyOutcome = { status: 'plaintext' };
const UNREADABLE_CONTAINER = 'the JSON container could not be parsed';

export function rekeyColumn(
  cipher: PayloadCipher,
  value: unknown,
  column: EncryptedColumn,
): RekeyOutcome {
  if (column.nestedProperty === undefined) {
    return rekeyValue(cipher, value);
  }

  if (value === null || value === undefined) {
    return CURRENT;
  }

  const container = asObject(value);

  if (container === null) {
    return { status: 'unreadable', reason: UNREADABLE_CONTAINER };
  }

  const outcome = rekeyValue(cipher, container[column.nestedProperty]);

  if (outcome.status !== 'rewritten') {
    return outcome;
  }

  return {
    status: 'rewritten',
    value: { ...container, [column.nestedProperty]: outcome.value },
  };
}

export function rekeyRow(
  cipher: PayloadCipher,
  columns: readonly EncryptedColumn[],
  read: (column: EncryptedColumn) => unknown,
): RowRekey {
  const changes: RekeyChange[] = [];
  const failures: RekeyFailure[] = [];
  let plaintext = 0;

  for (const column of columns) {
    try {
      const outcome = rekeyColumn(cipher, read(column), column);

      if (outcome.status === 'rewritten') {
        changes.push({ column, value: outcome.value });
      }

      if (outcome.status === 'plaintext') {
        plaintext += 1;
      }

      if (outcome.status === 'unreadable') {
        failures.push({ column: column.name, reason: outcome.reason });
      }
    } catch (error) {
      failures.push({ column: column.name, reason: messageOf(error) });
    }
  }

  return { changes, failures, plaintext };
}

function rekeyValue(cipher: PayloadCipher, value: unknown): RekeyOutcome {
  if (value === null || value === undefined) {
    return CURRENT;
  }

  if (typeof value !== 'string' || !isEncrypted(value)) {
    return PLAINTEXT;
  }

  if (cipher.isCurrentKey(value)) {
    return CURRENT;
  }

  return { status: 'rewritten', value: cipher.rekey(value) };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
