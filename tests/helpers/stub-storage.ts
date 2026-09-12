import type { SispStorage, SispStorageTx } from '../../src/core/contracts/storage';

function unsupported(): never {
  throw new Error('The stub storage does not implement this operation.');
}

function repository<T>(): T {
  return new Proxy({} as object, { get: () => unsupported }) as T;
}

export function stubStorage(): SispStorage {
  const repositories = {
    transactions: repository<SispStorage['transactions']>(),
    transactionItems: repository<SispStorage['transactionItems']>(),
    transactionAttempts: repository<SispStorage['transactionAttempts']>(),
    paymentIntents: repository<SispStorage['paymentIntents']>(),
    invoices: repository<SispStorage['invoices']>(),
    transactionLogs: repository<SispStorage['transactionLogs']>(),
    blacklist: repository<SispStorage['blacklist']>(),
    rateLimits: repository<SispStorage['rateLimits']>(),
    requestMetadata: repository<SispStorage['requestMetadata']>(),
  };

  return {
    ...repositories,
    transaction: <T>(work: (tx: SispStorageTx) => Promise<T>) => work(repositories),
    destroy: async () => {},
  };
}
