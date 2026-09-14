import type { EncryptedTableKey } from '../../../core/contracts/maintenance';
import type { ColumnCodec, ColumnCodecTable } from '../column-codec';
import { codecOf, jsonTextColumn } from '../column-codec';

const RAW_SQL_CODECS: ColumnCodecTable = {
  transactionLogs: { old_values: jsonTextColumn, new_values: jsonTextColumn },
  requestMetadata: { custom_metadata: jsonTextColumn },
};

export function prismaRawSqlCodec(table: EncryptedTableKey, column: string): ColumnCodec {
  return codecOf(RAW_SQL_CODECS, table, column);
}
