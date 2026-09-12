import { DEFAULT_TABLES, type SispTables } from '../../../application/config';
import type { SispStorage, SispStorageTx } from '../../../core/contracts/storage';
import { PayloadCipher } from '../knex/encryption';
import type { DrizzleConnection, DrizzleDatabase } from './client';
import { queryRunner, runInTransaction, runRaw, serialize } from './client';
import type { DrizzleDialect } from './migrations';
import { sispTablesDdl } from './migrations';
import { TableGateway } from './queries';
import { makeBlacklistRepository } from './repositories/blacklist';
import type { RepositoryContext } from './repositories/context';
import { makeInvoiceRepository } from './repositories/invoice';
import { makePaymentIntentRepository } from './repositories/payment-intent';
import { makeRateLimitRepository } from './repositories/rate-limit';
import { makeRequestMetadataRepository } from './repositories/request-metadata';
import { makeTransactionRepository } from './repositories/transaction';
import { makeTransactionAttemptRepository } from './repositories/transaction-attempt';
import { makeTransactionItemRepository } from './repositories/transaction-item';
import { makeTransactionLogRepository } from './repositories/transaction-log';
import { sispDrizzleSchema } from './schema';
import { SISP_TABLE_SPECS } from './schema/spec';
import type { SispDrizzleSchema } from './schema/types';
import { StatementQueue } from './serialization';

export interface DrizzleStorageOptions {
  dialect: DrizzleDialect;
  schema?: SispDrizzleSchema;
  autoMigrate?: boolean;
}

function repositories(context: RepositoryContext): SispStorageTx {
  return {
    transactions: makeTransactionRepository(context),
    transactionItems: makeTransactionItemRepository(context),
    transactionAttempts: makeTransactionAttemptRepository(context),
    paymentIntents: makePaymentIntentRepository(context),
    invoices: makeInvoiceRepository(context),
    transactionLogs: makeTransactionLogRepository(context),
    blacklist: makeBlacklistRepository(context),
    rateLimits: makeRateLimitRepository(context),
    requestMetadata: makeRequestMetadataRepository(context),
  };
}

class DrizzleStorage implements SispStorage {
  readonly transactions: SispStorageTx['transactions'];
  readonly transactionItems: SispStorageTx['transactionItems'];
  readonly transactionAttempts: SispStorageTx['transactionAttempts'];
  readonly paymentIntents: SispStorageTx['paymentIntents'];
  readonly invoices: SispStorageTx['invoices'];
  readonly transactionLogs: SispStorageTx['transactionLogs'];
  readonly blacklist: SispStorageTx['blacklist'];
  readonly rateLimits: SispStorageTx['rateLimits'];
  readonly requestMetadata: SispStorageTx['requestMetadata'];

  constructor(
    private readonly context: RepositoryContext,
    private readonly autoMigrate: boolean,
  ) {
    const built = repositories(context);

    this.transactions = built.transactions;
    this.transactionItems = built.transactionItems;
    this.transactionAttempts = built.transactionAttempts;
    this.paymentIntents = built.paymentIntents;
    this.invoices = built.invoices;
    this.transactionLogs = built.transactionLogs;
    this.blacklist = built.blacklist;
    this.rateLimits = built.rateLimits;
    this.requestMetadata = built.requestMetadata;
  }

  async transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T> {
    return runInTransaction(this.context.connection, (connection) =>
      work(repositories({ ...this.context, connection })),
    );
  }

  async migrate(): Promise<void> {
    if (!this.autoMigrate) {
      return;
    }

    const { db, dialect } = this.context.connection;

    const ddl = sispTablesDdl(this.context.tables, dialect);

    await serialize(this.context.connection, async () => {
      for (const statement of ddl.tables) {
        await runRaw(db, statement);
      }
    });

    await this.assertSchemaIsCurrent();

    await serialize(this.context.connection, async () => {
      for (const statement of ddl.indexes) {
        await runRaw(db, statement);
      }
    });
  }

  private async assertSchemaIsCurrent(): Promise<void> {
    for (const spec of SISP_TABLE_SPECS) {
      try {
        await new TableGateway(
          this.context.connection,
          this.context.schema,
          spec.key,
        ).assertColumnsExist();
      } catch (error) {
        throw new Error(
          `The table ${this.context.tables[spec.key]} exists but does not carry every column this adapter writes. CREATE TABLE IF NOT EXISTS leaves an older table untouched, so migrate it with the knex migrations or your own Drizzle Kit migration before using this adapter.`,
          { cause: error },
        );
      }
    }
  }

  async destroy(): Promise<void> {
    return;
  }
}

export function createDrizzleStorage(
  db: DrizzleDatabase,
  tables: SispTables | undefined,
  appKey: string | null,
  options: DrizzleStorageOptions,
): SispStorage {
  const resolvedTables = tables ?? DEFAULT_TABLES;
  const connection: DrizzleConnection = {
    db: queryRunner(db),
    dialect: options.dialect,
    inTransaction: false,
    queue: options.dialect === 'sqlite' ? new StatementQueue() : null,
  };

  const context: RepositoryContext = {
    connection,
    schema: options.schema ?? sispDrizzleSchema(options.dialect, resolvedTables),
    tables: resolvedTables,
    cipher: new PayloadCipher(appKey),
  };

  return new DrizzleStorage(context, options.autoMigrate ?? false);
}
