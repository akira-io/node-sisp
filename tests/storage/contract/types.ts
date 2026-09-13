import type { SispStorage } from '../../../src/core/contracts/storage';
import type { PayloadCipherKeys } from '../../../src/infrastructure/storage/knex/encryption';

export const CONTRACT_APP_KEY = 'app-key';

export type StoredJsonType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'boolean'
  | 'json-null'
  | 'sql-null';

export interface ContractSubject {
  storage: SispStorage;
  storedJsonType(table: string, column: string, id: number): Promise<StoredJsonType>;
  withKeys(keys: PayloadCipherKeys): Promise<SispStorage>;
  overwrite(table: string, column: string, id: number, value: string): Promise<void>;
}

export type GetContractSubject = () => ContractSubject;
