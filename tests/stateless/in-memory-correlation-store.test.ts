import { runCorrelationStoreContract } from './correlation-contract';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

runCorrelationStoreContract(
  'InMemoryPaymentCorrelationStore',
  () => new InMemoryPaymentCorrelationStore(),
  (store, merchantRef, merchantSession) => {
    const key = `${merchantRef}::${merchantSession}`;
    const matching = store.processed.filter((entry) => entry.key === key);

    return matching[matching.length - 1]?.outcome ?? null;
  },
);
