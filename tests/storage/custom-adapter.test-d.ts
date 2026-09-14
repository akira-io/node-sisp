import { expectTypeOf, test } from 'vitest';
import type {
  BlacklistEntry,
  BlacklistRecord,
  BlacklistRepository,
  InvoiceRecord,
  InvoiceRepository,
  InvoiceStatus,
  ListByTransactionOptions,
  ListTransactionsOptions,
  MaintenanceRepository,
  NewRequestMetadata,
  NewTransaction,
  PaymentIntentRecord,
  PaymentIntentRepository,
  PaymentRequest,
  RateLimitHit,
  RateLimitRepository,
  ReencryptResult,
  ReencryptSpec,
  RequestMetadataRecord,
  RequestMetadataRepository,
  SispStorage,
  SispStorageTx,
  TransactionAttemptChanges,
  TransactionAttemptRecord,
  TransactionAttemptRepository,
  TransactionChanges,
  TransactionItemData,
  TransactionItemRecord,
  TransactionItemRepository,
  TransactionLogRecord,
  TransactionLogRepository,
  TransactionRecord,
  TransactionRepository,
} from '../../src/index';

function pending(): never {
  throw new Error('This adapter exists to be type checked, never to be run.');
}

const transactions: TransactionRepository = {
  async create(_data: NewTransaction): Promise<TransactionRecord> {
    return pending();
  },
  async findById(_id: number) {
    return pending();
  },
  async findByIdForUpdate(_id: number) {
    return pending();
  },
  async findByRefAndSession(_merchantRef: string, _merchantSession: string) {
    return pending();
  },
  async findByRefAndSessionForUpdate(_merchantRef: string, _merchantSession: string) {
    return pending();
  },
  async findByRef(_merchantRef: string) {
    return pending();
  },
  async findByGatewayTransactionId(_transactionId: string) {
    return pending();
  },
  async list(_options?: ListTransactionsOptions): Promise<TransactionRecord[]> {
    return pending();
  },
  async listPendingForReconciliation(_cutoffIso: string, _limit: number) {
    return pending();
  },
  async update(_id: number, _changes: TransactionChanges): Promise<TransactionRecord> {
    return pending();
  },
};

const transactionItems: TransactionItemRepository = {
  async createMany(_transactionId: number, _items: readonly TransactionItemData[]): Promise<void> {
    return pending();
  },
  async listByTransaction(
    _transactionId: number,
    _options?: ListByTransactionOptions,
  ): Promise<TransactionItemRecord[]> {
    return pending();
  },
};

const transactionAttempts: TransactionAttemptRepository = {
  async createForPayment(
    _transaction: TransactionRecord,
    _paymentRequest: PaymentRequest,
    _supersedeCurrent?: boolean,
  ): Promise<TransactionAttemptRecord> {
    return pending();
  },
  async createFromTransaction(_transaction: TransactionRecord) {
    return pending();
  },
  async findByRefAndSession(_merchantRef: string, _merchantSession: string) {
    return pending();
  },
  async findByRefAndSessionForUpdate(_merchantRef: string, _merchantSession: string) {
    return pending();
  },
  async listByTransaction(_transactionId: number, _options?: ListByTransactionOptions) {
    return pending();
  },
  async existsByTransaction(_transactionId: number) {
    return pending();
  },
  async currentByTransaction(_transactionId: number) {
    return pending();
  },
  async update(_id: number, _changes: TransactionAttemptChanges) {
    return pending();
  },
};

const paymentIntents: PaymentIntentRepository = {
  async reserve(_idempotencyKey: string, _requestHash?: string | null) {
    return pending();
  },
  async findByKey(_idempotencyKey: string): Promise<PaymentIntentRecord | null> {
    return pending();
  },
  async submit(_idempotencyKey: string, _transactionId: number) {
    return pending();
  },
  async fail(_idempotencyKey: string, _reason: string, _transactionId?: number | null) {
    return pending();
  },
};

const invoices: InvoiceRepository = {
  async createForTransaction(_transaction: TransactionRecord): Promise<InvoiceRecord> {
    return pending();
  },
  async findByTransaction(_transactionId: number) {
    return pending();
  },
  async updateStatus(_transactionId: number, _status: InvoiceStatus) {
    return pending();
  },
};

const transactionLogs: TransactionLogRepository = {
  async listByTransaction(
    _transactionId: number,
    _options?: ListByTransactionOptions,
  ): Promise<TransactionLogRecord[]> {
    return pending();
  },
};

const blacklist: BlacklistRepository = {
  async find(_type: string, _value: string) {
    return pending();
  },
  async isBlacklisted(_type: string, _value: string) {
    return pending();
  },
  async add(_entry: BlacklistEntry): Promise<BlacklistRecord> {
    return pending();
  },
  async remove(_type: string, _value: string) {
    return pending();
  },
};

const rateLimits: RateLimitRepository = {
  async hit(_params: RateLimitHit) {
    return pending();
  },
};

const requestMetadata: RequestMetadataRepository = {
  async create(_data: NewRequestMetadata) {
    return pending();
  },
  async listByTransaction(
    _transactionId: number,
    _options?: ListByTransactionOptions,
  ): Promise<RequestMetadataRecord[]> {
    return pending();
  },
  async purgeOlderThan(_cutoffIso: string, _limit: number) {
    return pending();
  },
  async countOlderThan(_cutoffIso: string) {
    return pending();
  },
};

const maintenance: MaintenanceRepository = {
  async reencryptBatch(_spec: ReencryptSpec): Promise<ReencryptResult> {
    return pending();
  },
};

class CustomStorage implements SispStorage {
  readonly transactions = transactions;
  readonly transactionItems = transactionItems;
  readonly transactionAttempts = transactionAttempts;
  readonly paymentIntents = paymentIntents;
  readonly invoices = invoices;
  readonly transactionLogs = transactionLogs;
  readonly blacklist = blacklist;
  readonly rateLimits = rateLimits;
  readonly requestMetadata = requestMetadata;
  readonly maintenance = maintenance;

  async transaction<T>(_work: (tx: SispStorageTx) => Promise<T>): Promise<T> {
    return pending();
  }

  async migrate(): Promise<void> {
    return pending();
  }

  async destroy(): Promise<void> {
    return pending();
  }
}

test('every type a custom adapter needs is reachable from the package entry', () => {
  expectTypeOf<CustomStorage>().toExtend<SispStorage>();
});
