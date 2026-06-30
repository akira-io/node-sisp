import type { InvoiceStatus } from '../../domain/enums/invoice-status';
import type { TransactionItemData } from '../../domain/value-objects/transaction-item-data';
import type { PaymentRequest } from '../../domain/value-objects/payment-request';
import type {
  BlacklistRecord,
  InvoiceRecord,
  PaymentIntentRecord,
  RequestMetadataRecord,
  TransactionAttemptRecord,
  TransactionItemRecord,
  TransactionLogRecord,
  TransactionRecord,
} from '../../infrastructure/database/records';
import type {
  ListTransactionsOptions,
  NewTransaction,
  TransactionChanges,
} from '../../infrastructure/database/models/transaction';
import type { ListByTransactionOptions } from '../../infrastructure/database/list-options';
import type { TransactionAttemptChanges } from '../../infrastructure/database/models/transaction-attempt';
import type { BlacklistEntry } from '../../infrastructure/database/models/blacklist';
import type { RateLimitHit } from '../../infrastructure/database/models/rate-limit';
import type { NewRequestMetadata } from '../../infrastructure/database/models/request-metadata';

export interface TransactionRepository {
  create(data: NewTransaction): Promise<TransactionRecord>;
  findById(id: number): Promise<TransactionRecord | null>;
  findByIdForUpdate(id: number): Promise<TransactionRecord | null>;
  findByRefAndSession(merchantRef: string, merchantSession: string): Promise<TransactionRecord | null>;
  findByRefAndSessionForUpdate(merchantRef: string, merchantSession: string): Promise<TransactionRecord | null>;
  findByRef(merchantRef: string): Promise<TransactionRecord | null>;
  findByGatewayTransactionId(transactionId: string): Promise<TransactionRecord | null>;
  list(options?: ListTransactionsOptions): Promise<TransactionRecord[]>;
  listPendingForReconciliation(cutoffIso: string, limit: number): Promise<TransactionRecord[]>;
  update(id: number, changes: TransactionChanges): Promise<TransactionRecord>;
}

export interface TransactionItemRepository {
  createMany(transactionId: number, items: readonly TransactionItemData[]): Promise<void>;
  listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<TransactionItemRecord[]>;
}

export interface TransactionAttemptRepository {
  createForPayment(transaction: TransactionRecord, paymentRequest: PaymentRequest, supersedeCurrent?: boolean): Promise<TransactionAttemptRecord>;
  createFromTransaction(transaction: TransactionRecord): Promise<TransactionAttemptRecord>;
  findByRefAndSession(merchantRef: string, merchantSession: string): Promise<TransactionAttemptRecord | null>;
  findByRefAndSessionForUpdate(merchantRef: string, merchantSession: string): Promise<TransactionAttemptRecord | null>;
  listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<TransactionAttemptRecord[]>;
  existsByTransaction(transactionId: number): Promise<boolean>;
  currentByTransaction(transactionId: number): Promise<TransactionAttemptRecord | null>;
  update(id: number, changes: TransactionAttemptChanges): Promise<TransactionAttemptRecord>;
}

export interface PaymentIntentRepository {
  reserve(idempotencyKey: string): Promise<boolean>;
  findByKey(idempotencyKey: string): Promise<PaymentIntentRecord | null>;
  submit(idempotencyKey: string, transactionId: number): Promise<void>;
  fail(idempotencyKey: string, reason: string, transactionId?: number | null): Promise<void>;
}

export interface InvoiceRepository {
  createForTransaction(transaction: TransactionRecord): Promise<InvoiceRecord>;
  findByTransaction(transactionId: number): Promise<InvoiceRecord | null>;
  updateStatus(transactionId: number, status: InvoiceStatus): Promise<void>;
}

export interface TransactionLogRepository {
  listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<TransactionLogRecord[]>;
}

export interface BlacklistRepository {
  find(type: string, value: string): Promise<BlacklistRecord | null>;
  isBlacklisted(type: string, value: string): Promise<boolean>;
  add(entry: BlacklistEntry): Promise<BlacklistRecord>;
  remove(type: string, value: string): Promise<boolean>;
}

export interface RateLimitRepository {
  hit(params: RateLimitHit): Promise<boolean>;
}

export interface RequestMetadataRepository {
  create(data: NewRequestMetadata): Promise<void>;
  listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<RequestMetadataRecord[]>;
}

export interface SispStorageRepositories {
  transactions: TransactionRepository;
  transactionItems: TransactionItemRepository;
  transactionAttempts: TransactionAttemptRepository;
  paymentIntents: PaymentIntentRepository;
  invoices: InvoiceRepository;
  transactionLogs: TransactionLogRepository;
  blacklist: BlacklistRepository;
  rateLimits: RateLimitRepository;
  requestMetadata: RequestMetadataRepository;
}

export interface SispStorageTx extends SispStorageRepositories {}

export interface SispStorage extends SispStorageRepositories {
  transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T>;
  migrate?(): Promise<void>;
  destroy(): Promise<void>;
}
