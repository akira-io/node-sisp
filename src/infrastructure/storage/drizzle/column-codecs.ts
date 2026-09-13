import type { EncryptedTableKey } from '../../../core/contracts/maintenance';
import type { ColumnCodec, ColumnCodecTable } from '../column-codec';
import { codecOf, jsonValueColumn } from '../column-codec';

const CODECS: ColumnCodecTable = {
  transactionLogs: {
    changed_attributes: jsonValueColumn,
    old_values: jsonValueColumn,
    new_values: jsonValueColumn,
  },
  requestMetadata: { custom_metadata: jsonValueColumn },
};

export function drizzleColumnCodec(table: EncryptedTableKey, column: string): ColumnCodec {
  return codecOf(CODECS, table, column);
}
