import { DEFAULT_TABLES, type SispTables } from '../../../application/config';
import type { SispStorage, SispStorageTx } from '../../../core/contracts/storage';
import { PayloadCipher } from '../knex/encryption';
import {
  DEFAULT_TRANSACTION_OPTIONS,
  type PrismaClientLike,
  type PrismaTransactionOptions,
  runInTransaction,
} from './client';
import { makeBlacklistRepository } from './repositories/blacklist';
import { makeInvoiceRepository } from './repositories/invoice';
import { makePaymentIntentRepository } from './repositories/payment-intent';
import { makeRateLimitRepository } from './repositories/rate-limit';
import { makeRequestMetadataRepository } from './repositories/request-metadata';
import { makeTransactionRepository } from './repositories/transaction';
import { makeTransactionAttemptRepository } from './repositories/transaction-attempt';
import { makeTransactionItemRepository } from './repositories/transaction-item';
import { makeTransactionLogRepository } from './repositories/transaction-log';

export type PrismaSqlProvider = 'postgresql' | 'mysql' | 'sqlite';

class PrismaStorage implements SispStorage {
  readonly transactions: ReturnType<typeof makeTransactionRepository>;
  readonly transactionItems: ReturnType<typeof makeTransactionItemRepository>;
  readonly transactionAttempts: ReturnType<typeof makeTransactionAttemptRepository>;
  readonly paymentIntents: ReturnType<typeof makePaymentIntentRepository>;
  readonly invoices: ReturnType<typeof makeInvoiceRepository>;
  readonly transactionLogs: ReturnType<typeof makeTransactionLogRepository>;
  readonly blacklist: ReturnType<typeof makeBlacklistRepository>;
  readonly rateLimits: ReturnType<typeof makeRateLimitRepository>;
  readonly requestMetadata: ReturnType<typeof makeRequestMetadataRepository>;

  constructor(
    private readonly prisma: PrismaClientLike,
    private readonly tables: SispTables,
    private readonly cipher: PayloadCipher,
    private readonly provider: PrismaSqlProvider,
    private readonly txOptions: PrismaTransactionOptions,
  ) {
    this.transactions = makeTransactionRepository(prisma, tables, cipher, provider, txOptions);
    this.transactionItems = makeTransactionItemRepository(prisma, tables);
    this.transactionAttempts = makeTransactionAttemptRepository(prisma, tables, cipher, provider);
    this.paymentIntents = makePaymentIntentRepository(prisma, tables);
    this.invoices = makeInvoiceRepository(prisma, tables);
    this.transactionLogs = makeTransactionLogRepository(prisma, tables, cipher);
    this.blacklist = makeBlacklistRepository(prisma, tables);
    this.rateLimits = makeRateLimitRepository(prisma, tables, provider, txOptions);
    this.requestMetadata = makeRequestMetadataRepository(prisma, tables, cipher);
  }

  async transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T> {
    return runInTransaction(this.prisma, (txc) => work(this.scoped(txc)), this.txOptions);
  }

  async destroy(): Promise<void> {
    await this.prisma.$disconnect?.();
  }

  private scoped(txc: PrismaClientLike): SispStorageTx {
    return {
      transactions: makeTransactionRepository(
        txc,
        this.tables,
        this.cipher,
        this.provider,
        this.txOptions,
      ),
      transactionItems: makeTransactionItemRepository(txc, this.tables),
      transactionAttempts: makeTransactionAttemptRepository(
        txc,
        this.tables,
        this.cipher,
        this.provider,
      ),
      paymentIntents: makePaymentIntentRepository(txc, this.tables),
      invoices: makeInvoiceRepository(txc, this.tables),
      transactionLogs: makeTransactionLogRepository(txc, this.tables, this.cipher),
      blacklist: makeBlacklistRepository(txc, this.tables),
      rateLimits: makeRateLimitRepository(txc, this.tables, this.provider, this.txOptions),
      requestMetadata: makeRequestMetadataRepository(txc, this.tables, this.cipher),
    };
  }
}

export function createPrismaStorage(
  prisma: PrismaClientLike,
  tables: SispTables | undefined,
  appKey: string | null,
  options: {
    provider: PrismaSqlProvider;
    transactionOptions?: PrismaTransactionOptions;
  },
): SispStorage {
  return new PrismaStorage(
    prisma,
    tables ?? DEFAULT_TABLES,
    new PayloadCipher(appKey),
    options.provider,
    { ...DEFAULT_TRANSACTION_OPTIONS, ...options.transactionOptions },
  );
}
