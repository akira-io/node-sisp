import { afterEach, beforeEach } from 'vitest';
import type { SispStorage } from '../../src/core/contracts/storage';
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

  beforeEach(async () => {
    subject = await makeSubject();
    storage = subject.storage;
  });

  afterEach(async () => {
    await storage.destroy();
  });

  const getSubject = () => subject;

  runTransactionsContract(getSubject);
  runPaymentIntentsContract(getSubject);
  runTransactionItemsContract(getSubject);
  runTransactionAttemptsContract(getSubject);
  runRateLimitsContract(getSubject);
  runRequestMetadataContract(getSubject);
}
