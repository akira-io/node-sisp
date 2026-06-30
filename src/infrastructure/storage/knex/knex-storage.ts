import type { Knex } from 'knex';
import type { SispDatabaseConfig, SispTables } from '../../../application/config';
import type { SispStorage, SispStorageTx } from '../../../core/contracts/storage';
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
  readonly transactions: Transaction;
  readonly transactionItems: TransactionItem;
  readonly transactionAttempts: TransactionAttempt;
  readonly paymentIntents: PaymentIntent;
  readonly invoices: Invoice;
  readonly transactionLogs: TransactionLog;
  readonly blacklist: Blacklist;
  readonly rateLimits: RateLimit;
  readonly requestMetadata: RequestMetadata;

  private constructor(
    private readonly db: Knex,
    private readonly database: Required<SispDatabaseConfig>,
    private readonly tables: SispTables,
    cipher: PayloadCipher,
  ) {
    this.transactions = new Transaction(db, tables, cipher);
    this.transactionItems = new TransactionItem(db, tables);
    this.transactionAttempts = new TransactionAttempt(db, tables, cipher);
    this.paymentIntents = new PaymentIntent(db, tables);
    this.invoices = new Invoice(db, tables);
    this.transactionLogs = new TransactionLog(db, tables);
    this.blacklist = new Blacklist(db, tables);
    this.rateLimits = new RateLimit(db, tables);
    this.requestMetadata = new RequestMetadata(db, tables);
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
      transactions: this.transactions.withConnection(trx),
      transactionItems: this.transactionItems.withConnection(trx),
      transactionAttempts: this.transactionAttempts.withConnection(trx),
      paymentIntents: this.paymentIntents.withConnection(trx),
      invoices: this.invoices.withConnection(trx),
      transactionLogs: this.transactionLogs.withConnection(trx),
      blacklist: this.blacklist.withConnection(trx),
      rateLimits: this.rateLimits.withConnection(trx),
      requestMetadata: this.requestMetadata.withConnection(trx),
    };
  }
}
