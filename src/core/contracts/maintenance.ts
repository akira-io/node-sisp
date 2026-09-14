export type EncryptedTableKey =
  | 'transactions'
  | 'transactionAttempts'
  | 'transactionLogs'
  | 'requestMetadata';

export interface EncryptedColumn {
  name: string;
  nestedProperty?: string;
}

export interface ReencryptSpec {
  table: EncryptedTableKey;
  columns: readonly EncryptedColumn[];
  afterId: number;
  limit: number;
}

export interface ReencryptFailure {
  id: number;
  column: string;
  reason: string;
}

export interface ReencryptResult {
  processed: number;
  rewritten: number;
  current: number;
  plaintext: number;
  unreadable: number;
  vanished: number;
  unreadableValues: readonly ReencryptFailure[];
  lastId: number | null;
}

export interface MaintenanceRepository {
  reencryptBatch(spec: ReencryptSpec): Promise<ReencryptResult>;
}

export const ENCRYPTED_COLUMNS: readonly {
  table: EncryptedTableKey;
  columns: readonly EncryptedColumn[];
}[] = [
  { table: 'transactions', columns: [{ name: 'payload' }] },
  {
    table: 'transactionAttempts',
    columns: [{ name: 'payload' }, { name: 'callback_payload' }],
  },
  {
    table: 'transactionLogs',
    columns: [
      { name: 'old_values', nestedProperty: 'payload' },
      { name: 'new_values', nestedProperty: 'payload' },
    ],
  },
  { table: 'requestMetadata', columns: [{ name: 'custom_metadata' }] },
];
