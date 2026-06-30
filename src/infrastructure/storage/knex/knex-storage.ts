import type { Knex } from 'knex';
import type { SispDatabaseConfig, SispTables } from '../../../application/config';
import type {
  BlacklistRepository,
  InvoiceRepository,
  PaymentIntentRepository,
  RateLimitRepository,
  RequestMetadataRepository,
  SispStorage,
  SispStorageTx,
  TransactionAttemptRepository,
  TransactionItemRepository,
  TransactionLogRepository,
  TransactionRepository,
} from '../../../core/contracts/storage';
import { runMigrations } from './auto-migrate';
import { createKnexInstance } from './create-knex';
import { PayloadCipher } from './encryption';
import { Blacklist } from './models/blacklist';
import { Invoice } from './models/invoice';
import { PaymentIntent } from './models/payment-intent';
import { RateLimit } from './models/rate-limit';
import { RequestMetadata } from './models/request-metadata';
import { Transaction } from './models/transaction';
import { TransactionAttempt } from './models/transaction-attempt';
import { TransactionItem } from './models/transaction-item';
import { TransactionLog } from './models/transaction-log';

export class KnexStorage implements SispStorage {
  readonly transactions: TransactionRepository;
  readonly transactionItems: TransactionItemRepository;
  readonly transactionAttempts: TransactionAttemptRepository;
  readonly paymentIntents: PaymentIntentRepository;
  readonly invoices: InvoiceRepository;
  readonly transactionLogs: TransactionLogRepository;
  readonly blacklist: BlacklistRepository;
  readonly rateLimits: RateLimitRepository;
  readonly requestMetadata: RequestMetadataRepository;

  private readonly transactionsModel: Transaction;
  private readonly transactionItemsModel: TransactionItem;
  private readonly transactionAttemptsModel: TransactionAttempt;
  private readonly paymentIntentsModel: PaymentIntent;
  private readonly invoicesModel: Invoice;
  private readonly transactionLogsModel: TransactionLog;
  private readonly blacklistModel: Blacklist;
  private readonly rateLimitsModel: RateLimit;
  private readonly requestMetadataModel: RequestMetadata;

  private constructor(
    private readonly db: Knex,
    private readonly database: Required<SispDatabaseConfig>,
    private readonly tables: SispTables,
    cipher: PayloadCipher,
  ) {
    this.transactionsModel = new Transaction(db, tables, cipher);
    this.transactionItemsModel = new TransactionItem(db, tables);
    this.transactionAttemptsModel = new TransactionAttempt(db, tables, cipher);
    this.paymentIntentsModel = new PaymentIntent(db, tables);
    this.invoicesModel = new Invoice(db, tables);
    this.transactionLogsModel = new TransactionLog(db, tables);
    this.blacklistModel = new Blacklist(db, tables);
    this.rateLimitsModel = new RateLimit(db, tables);
    this.requestMetadataModel = new RequestMetadata(db, tables);

    this.transactions = this.transactionsModel;
    this.transactionItems = this.transactionItemsModel;
    this.transactionAttempts = this.transactionAttemptsModel;
    this.paymentIntents = this.paymentIntentsModel;
    this.invoices = this.invoicesModel;
    this.transactionLogs = this.transactionLogsModel;
    this.blacklist = this.blacklistModel;
    this.rateLimits = this.rateLimitsModel;
    this.requestMetadata = this.requestMetadataModel;
  }

  static create(
    database: Required<SispDatabaseConfig>,
    tables: SispTables,
    appKey: string | null,
  ): KnexStorage {
    const db = createKnexInstance(database);
    const cipher = new PayloadCipher(appKey);

    return new KnexStorage(db, database, tables, cipher);
  }

  async transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) => work(this.scoped(trx)));
  }

  async migrate(): Promise<void> {
    if (!this.database.autoMigrate) {
      return;
    }

    await runMigrations(this.db, this.tables);
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }

  get raw(): Knex {
    return this.db;
  }

  private scoped(trx: Knex.Transaction): SispStorageTx {
    return {
      transactions: this.transactionsModel.withConnection(trx),
      transactionItems: this.transactionItemsModel.withConnection(trx),
      transactionAttempts: this.transactionAttemptsModel.withConnection(trx),
      paymentIntents: this.paymentIntentsModel.withConnection(trx),
      invoices: this.invoicesModel.withConnection(trx),
      transactionLogs: this.transactionLogsModel.withConnection(trx),
      blacklist: this.blacklistModel.withConnection(trx),
      rateLimits: this.rateLimitsModel.withConnection(trx),
      requestMetadata: this.requestMetadataModel.withConnection(trx),
    };
  }
}
