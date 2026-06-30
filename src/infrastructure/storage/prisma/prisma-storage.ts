import { DEFAULT_TABLES, type SispTables } from '../../../application/config';
import type { SispStorage, SispStorageTx } from '../../../core/contracts/storage';
import { PayloadCipher } from '../knex/encryption';
import type { PrismaClientLike } from './client';
import { makeBlacklistRepository } from './repositories/blacklist';
import { makeInvoiceRepository } from './repositories/invoice';
import { makePaymentIntentRepository } from './repositories/payment-intent';
import { makeRateLimitRepository } from './repositories/rate-limit';
import { makeRequestMetadataRepository } from './repositories/request-metadata';
import { makeTransactionAttemptRepository } from './repositories/transaction-attempt';
import { makeTransactionItemRepository } from './repositories/transaction-item';
import { makeTransactionLogRepository } from './repositories/transaction-log';
import { makeTransactionRepository } from './repositories/transaction';

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
  ) {
    this.transactions = makeTransactionRepository(prisma, tables, cipher, provider);
    this.transactionItems = makeTransactionItemRepository(prisma, tables);
    this.transactionAttempts = makeTransactionAttemptRepository(prisma, tables, cipher, provider);
    this.paymentIntents = makePaymentIntentRepository(prisma, tables);
    this.invoices = makeInvoiceRepository(prisma, tables);
    this.transactionLogs = makeTransactionLogRepository(prisma, tables);
    this.blacklist = makeBlacklistRepository(prisma, tables);
    this.rateLimits = makeRateLimitRepository(prisma, tables, provider);
    this.requestMetadata = makeRequestMetadataRepository(prisma, tables);
  }

  async transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((txc) => work(this.scoped(txc)));
  }

  async destroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private scoped(txc: PrismaClientLike): SispStorageTx {
    return {
      transactions: makeTransactionRepository(txc, this.tables, this.cipher, this.provider),
      transactionItems: makeTransactionItemRepository(txc, this.tables),
      transactionAttempts: makeTransactionAttemptRepository(txc, this.tables, this.cipher, this.provider),
      paymentIntents: makePaymentIntentRepository(txc, this.tables),
      invoices: makeInvoiceRepository(txc, this.tables),
      transactionLogs: makeTransactionLogRepository(txc, this.tables),
      blacklist: makeBlacklistRepository(txc, this.tables),
      rateLimits: makeRateLimitRepository(txc, this.tables, this.provider),
      requestMetadata: makeRequestMetadataRepository(txc, this.tables),
    };
  }
}

export function createPrismaStorage(
  prisma: PrismaClientLike,
  tables: SispTables | undefined,
  appKey: string | null,
  options: { provider: PrismaSqlProvider },
): SispStorage {
  return new PrismaStorage(
    prisma,
    tables ?? DEFAULT_TABLES,
    new PayloadCipher(appKey),
    options.provider,
  );
}
