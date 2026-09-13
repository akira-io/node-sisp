import { afterEach, beforeEach } from 'vitest';
import type { SispStorage } from '../../src/core/contracts/storage';
import type { PayloadCipherKeys } from '../../src/infrastructure/storage/knex/encryption';
import { runMaintenanceContract } from './contract/maintenance';
import { runPaymentIntentsContract } from './contract/payment-intents';
import { runRateLimitsContract } from './contract/rate-limits';
import { runRequestMetadataContract } from './contract/request-metadata';
import { runTransactionAttemptsContract } from './contract/transaction-attempts';
import { runTransactionItemsContract } from './contract/transaction-items';
import { runTransactionsContract } from './contract/transactions';
import type { ContractSubject } from './contract/types';

export type { ContractSubject, StoredJsonType } from './contract/types';

export function runStorageContract(makeSubject: () => Promise<ContractSubject>): void {
  let subject: ContractSubject;
  let storage: SispStorage;
  let extras: SispStorage[] = [];

  beforeEach(async () => {
    subject = await makeSubject();
    storage = subject.storage;
    extras = [];
  });

  afterEach(async () => {
    for (const extra of extras) {
      await extra.destroy();
    }

    await storage.destroy();
  });

  const getSubject = (): ContractSubject => ({
    ...subject,
    storedJsonType: (table, column, id) => subject.storedJsonType(table, column, id),
    async withKeys(keys: PayloadCipherKeys): Promise<SispStorage> {
      const extra = await subject.withKeys(keys);

      extras.push(extra);

      return extra;
    },
  });

  runTransactionsContract(getSubject);
  runPaymentIntentsContract(getSubject);
  runTransactionItemsContract(getSubject);
  runTransactionAttemptsContract(getSubject);
  runRateLimitsContract(getSubject);
  runRequestMetadataContract(getSubject);
  runMaintenanceContract(getSubject);
}
