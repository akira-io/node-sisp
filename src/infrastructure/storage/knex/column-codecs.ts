import type { EncryptedTableKey } from '../../../core/contracts/maintenance';
import type { ColumnCodec, ColumnCodecTable } from '../column-codec';
import { codecOf, jsonTextColumn } from '../column-codec';

const CODECS: ColumnCodecTable = {
  transactionLogs: { old_values: jsonTextColumn, new_values: jsonTextColumn },
  requestMetadata: { custom_metadata: jsonTextColumn },
};

export function knexColumnCodec(table: EncryptedTableKey, column: string): ColumnCodec {
  return codecOf(CODECS, table, column);
}
