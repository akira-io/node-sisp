import { BuildRequestPayloadAction } from './actions/build-request-payload';
import { FailTransactionAction } from './actions/fail-transaction';
import { StoreRequestMetadataAction } from './actions/store-request-metadata';
import { UpdateInvoiceStatusAction } from './actions/update-invoice-status';
import { credentialsFromConfig, type ResolvedSispConfig, resolveConfig, type SispConfig } from './config';
import { type CredentialsResolver, StaticCredentialsResolver } from './contracts/credentials-resolver';
import type { CallbackPipe, PaymentPipe } from './contracts/pipes';
import { runMigrations } from './database/auto-migrate';
import { createKnexInstance } from './database/create-knex';
import { PayloadCipher } from './database/encryption';
import { Blacklist } from './database/models/blacklist';
import { Invoice } from './database/models/invoice';
import { RateLimit } from './database/models/rate-limit';
import { RequestMetadata } from './database/models/request-metadata';
import { TransactionItem } from './database/models/transaction-item';
import { TransactionLog } from './database/models/transaction-log';
import { Transaction } from './database/models/transaction';
import { createSispManager } from './drivers/sisp-manager';
import { SispEventEmitter } from './events';
import { SispHttpHandlers } from './http/handlers';
import { HandleCallbackPipeline } from './pipelines/callback/handle-callback-pipeline';
import { ApplyTransactionStatus } from './pipelines/callback/pipes/apply-transaction-status';
import { DispatchPaymentEvents } from './pipelines/callback/pipes/dispatch-payment-events';
import { EnsureCallbackMatchesTransaction } from './pipelines/callback/pipes/ensure-callback-matches-transaction';
import { ResolveTransaction } from './pipelines/callback/pipes/resolve-transaction';
import { ValidateFingerprint } from './pipelines/callback/pipes/validate-fingerprint';
import { ProcessPaymentPipeline } from './pipelines/payment/process-payment-pipeline';
import { BuildPaymentRequest } from './pipelines/payment/pipes/build-payment-request';
import { CaptureRequestMetadata } from './pipelines/payment/pipes/capture-request-metadata';
import { EnforceRateLimits } from './pipelines/payment/pipes/enforce-rate-limits';
import { EnsureIpIsNotBlacklisted } from './pipelines/payment/pipes/ensure-ip-is-not-blacklisted';
import { PersistTransaction } from './pipelines/payment/pipes/persist-transaction';
import { BuildSandboxPayloadAction } from './sandbox';
import { Sisp, type SispModels } from './sisp';

export async function createSisp(config: SispConfig): Promise<Sisp> {
  const resolved = resolveConfig(config);
  const db = createKnexInstance(resolved.database);

  if (resolved.database.autoMigrate) {
    await runMigrations(db, resolved.tables);
  }

  const cipher = new PayloadCipher(resolved.appKey);
  const credentialsResolver = new StaticCredentialsResolver(credentialsFromConfig(resolved));
  const events = new SispEventEmitter(resolved.onEventListenerError ?? undefined);
  const manager = createSispManager(resolved, credentialsResolver);

  const models: SispModels = {
    transactions: new Transaction(db, resolved.tables, cipher),
    transactionItems: new TransactionItem(db, resolved.tables),
    invoices: new Invoice(db, resolved.tables),
    transactionLogs: new TransactionLog(db, resolved.tables),
    blacklist: new Blacklist(db, resolved.tables),
  };

  const buildRequestPayload = new BuildRequestPayloadAction(resolved, credentialsResolver);
  const storeMetadata = new StoreRequestMetadataAction(
    new RequestMetadata(db, resolved.tables),
  );
  const buildSandboxPayload = new BuildSandboxPayloadAction(resolved, credentialsResolver);

  const paymentPipeline = new ProcessPaymentPipeline(
    customizePipes(resolved.pipelines.payment, [
      new EnsureIpIsNotBlacklisted(models.blacklist),
      new EnforceRateLimits(new RateLimit(db, resolved.tables), resolved.rateLimiting),
      new BuildPaymentRequest(buildRequestPayload),
      new PersistTransaction(db, models.transactions, models.transactionItems, models.invoices),
      new CaptureRequestMetadata(storeMetadata),
    ]),
  );

  const failTransaction = new FailTransactionAction(models.transactions);

  const callbackPipeline = new HandleCallbackPipeline(
    customizePipes(resolved.pipelines.callback, [
      new ResolveTransaction(models.transactions),
      new ValidateFingerprint(credentialsResolver, failTransaction, events),
      new EnsureCallbackMatchesTransaction(resolved, credentialsResolver, failTransaction, events),
      new ApplyTransactionStatus(models.transactions),
      new DispatchPaymentEvents(events),
    ]),
  );

  const handlers = new SispHttpHandlers(
    resolved,
    manager,
    paymentPipeline,
    callbackPipeline,
    models.transactions,
    models.invoices,
    storeMetadata,
    new UpdateInvoiceStatusAction(models.invoices),
    buildSandboxPayload,
  );

  return new Sisp(
    resolved,
    db,
    events,
    manager,
    models,
    handlers,
    credentialsResolver,
    buildRequestPayload,
    buildSandboxPayload,
    callbackPipeline,
  );
}

export type { ResolvedSispConfig, SispConfig, CredentialsResolver };

function customizePipes<TPipe extends PaymentPipe | CallbackPipe>(
  customize: ((defaults: TPipe[]) => TPipe[]) | undefined,
  defaults: TPipe[],
): TPipe[] {
  return customize ? customize(defaults) : defaults;
}
