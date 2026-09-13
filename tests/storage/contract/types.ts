import type { SispStorage } from '../../../src/core/contracts/storage';

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
}

export type GetContractSubject = () => ContractSubject;
