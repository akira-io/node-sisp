import { runCorrelationStoreContract } from './correlation-contract';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

runCorrelationStoreContract(
  'InMemoryPaymentCorrelationStore',
  () => new InMemoryPaymentCorrelationStore(),
  (store) => store.processed.map((entry) => entry.outcome),
);
