import { BuildRefundRequestAction } from './actions/build-refund-request';
import { CanRetryPaymentAction } from './actions/can-retry-payment';
import { CancelTransactionAction } from './actions/cancel-transaction';
import { RefundTransactionAction } from './actions/refund-transaction';
import { RetryPaymentAction } from './actions/retry-payment';
import { StoreRequestMetadataAction } from './actions/store-request-metadata';
import {
  credentialsFromConfig,
  type ResolvedSispConfig,
  resolveConfig,
  type SispConfig,
} from './config';
import {
  type CredentialsResolver,
  StaticCredentialsResolver,
} from './contracts/credentials-resolver';
import { runMigrations } from './database/auto-migrate';
import { createKnexInstance } from './database/create-knex';
import { PayloadCipher } from './database/encryption';
import { Blacklist } from './database/models/blacklist';
import { Invoice } from './database/models/invoice';
import { RateLimit } from './database/models/rate-limit';
import { RequestMetadata } from './database/models/request-metadata';
import { Transaction } from './database/models/transaction';
import { TransactionItem } from './database/models/transaction-item';
import { TransactionLog } from './database/models/transaction-log';
import { SispEventEmitter } from './events';
import { SispHttpHandlers } from './http/handlers';
import { BuildPaymentRequest } from './pipelines/payment/pipes/build-payment-request';
import { CaptureRequestMetadata } from './pipelines/payment/pipes/capture-request-metadata';
import { EnforceRateLimits } from './pipelines/payment/pipes/enforce-rate-limits';
import { EnsureIpIsNotBlacklisted } from './pipelines/payment/pipes/ensure-ip-is-not-blacklisted';
import { PersistTransaction } from './pipelines/payment/pipes/persist-transaction';
import { ProcessPaymentPipeline } from './pipelines/payment/process-payment-pipeline';
import { Sisp, type SispModels } from './sisp';
import { UrlSigner } from './support/signed-url';
import { customizePipes, wireCredentialScopedServices } from './wiring';

export async function createSisp(config: SispConfig): Promise<Sisp> {
  const resolved = resolveConfig(config);
  const db = createKnexInstance(resolved.database);

  if (resolved.database.autoMigrate) {
    await runMigrations(db, resolved.tables);
  }

  const cipher = new PayloadCipher(resolved.appKey);
  const credentialsResolver = new StaticCredentialsResolver(credentialsFromConfig(resolved));
  const events = new SispEventEmitter(resolved.onEventListenerError ?? undefined);

  const models: SispModels = {
    transactions: new Transaction(db, resolved.tables, cipher),
    transactionItems: new TransactionItem(db, resolved.tables),
    invoices: new Invoice(db, resolved.tables),
    transactionLogs: new TransactionLog(db, resolved.tables),
    blacklist: new Blacklist(db, resolved.tables),
  };

  const services = wireCredentialScopedServices(resolved, events, models, credentialsResolver);
  const storeMetadata = new StoreRequestMetadataAction(new RequestMetadata(db, resolved.tables));
  const rateLimits = new RateLimit(db, resolved.tables);

  const paymentPipeline = new ProcessPaymentPipeline(
    customizePipes(resolved.pipelines.payment, [
      new EnsureIpIsNotBlacklisted(models.blacklist),
      new EnforceRateLimits(rateLimits, resolved.rateLimiting),
      new BuildPaymentRequest(services.buildRequestPayload),
      new PersistTransaction(db, models.transactions, models.transactionItems, models.invoices),
      new CaptureRequestMetadata(storeMetadata),
    ]),
  );

  const urlSigner = new UrlSigner(resolved.appKey);
  const cancelTransaction = new CancelTransactionAction(models.transactions, events);
  const retryPayment = new RetryPaymentAction(services.buildRequestPayload);
  const canRetryPayment = new CanRetryPaymentAction(resolved);
  const refundTransaction = new RefundTransactionAction(
    models.transactions,
    new BuildRefundRequestAction(resolved, credentialsResolver),
    events,
  );

  const handlers = new SispHttpHandlers({
    config: resolved,
    manager: services.manager,
    paymentPipeline,
    callbackPipeline: services.callbackPipeline,
    transactions: models.transactions,
    invoices: models.invoices,
    storeMetadata,
    updateInvoiceStatus: services.updateInvoiceStatus,
    buildSandboxPayload: services.buildSandboxPayload,
    cancelTransaction,
    retryPayment,
    canRetryPayment,
    refundTransaction,
    rateLimits,
    urlSigner,
  });

  return new Sisp(
    resolved,
    db,
    events,
    services.manager,
    models,
    handlers,
    credentialsResolver,
    services.buildRequestPayload,
    services.buildSandboxPayload,
    services.callbackPipeline,
    cancelTransaction,
    refundTransaction,
    services.reconcileTransaction,
    urlSigner,
  );
}

export type { CredentialsResolver, ResolvedSispConfig, SispConfig };
