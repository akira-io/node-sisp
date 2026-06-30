import {
  type CredentialsResolver,
  StaticCredentialsResolver,
} from '../core/contracts/credentials-resolver';
import { SispHttpHandlers } from '../infrastructure/http/handlers';
import { KnexStorage } from '../infrastructure/storage/knex/knex-storage';
import { UrlSigner } from '../support/signed-url';
import { BuildRefundRequestAction } from './actions/build-refund-request';
import { CanRetryPaymentAction } from './actions/can-retry-payment';
import { CancelTransactionAction } from './actions/cancel-transaction';
import { CreateRetryPaymentAttemptAction } from './actions/create-retry-payment-attempt';
import { RefundTransactionAction } from './actions/refund-transaction';
import { RetryPaymentAction } from './actions/retry-payment';
import { StoreRequestMetadataAction } from './actions/store-request-metadata';
import {
  credentialsFromConfig,
  type ResolvedSispConfig,
  resolveConfig,
  type SispConfig,
} from './config';
import { SispEventEmitter } from './events';
import { BuildPaymentRequest } from './pipelines/payment/pipes/build-payment-request';
import { CaptureRequestMetadata } from './pipelines/payment/pipes/capture-request-metadata';
import { EnforceRateLimits } from './pipelines/payment/pipes/enforce-rate-limits';
import { EnsureIpIsNotBlacklisted } from './pipelines/payment/pipes/ensure-ip-is-not-blacklisted';
import { PersistTransaction } from './pipelines/payment/pipes/persist-transaction';
import { ProcessPaymentPipeline } from './pipelines/payment/process-payment-pipeline';
import { Sisp, type SispModels } from './sisp';
import { customizePipes, wireCredentialScopedServices } from './wiring';

export async function createSisp(config: SispConfig): Promise<Sisp> {
  const resolved = resolveConfig(config);
  const storage = KnexStorage.create(resolved.database, resolved.tables, resolved.appKey);

  if (resolved.database.autoMigrate) {
    await storage.migrate();
  }

  const db = storage.raw;
  const credentialsResolver = new StaticCredentialsResolver(credentialsFromConfig(resolved));
  const events = new SispEventEmitter(resolved.onEventListenerError ?? undefined);

  const models: SispModels = {
    transactions: storage.transactions,
    transactionItems: storage.transactionItems,
    transactionAttempts: storage.transactionAttempts,
    paymentIntents: storage.paymentIntents,
    invoices: storage.invoices,
    transactionLogs: storage.transactionLogs,
    blacklist: storage.blacklist,
  };

  const services = wireCredentialScopedServices(
    storage,
    resolved,
    events,
    models,
    credentialsResolver,
  );
  const storeMetadata = new StoreRequestMetadataAction(storage.requestMetadata);
  const rateLimits = storage.rateLimits;
  const paymentPreflightPipes = [
    new EnsureIpIsNotBlacklisted(models.blacklist),
    new EnforceRateLimits(rateLimits, resolved.rateLimiting),
  ];

  const paymentPipeline = new ProcessPaymentPipeline(
    customizePipes(resolved.pipelines.payment, [
      ...paymentPreflightPipes,
      new BuildPaymentRequest(services.buildRequestPayload),
      new PersistTransaction(resolved, storage, services.buildRequestPayload),
      new CaptureRequestMetadata(storeMetadata),
    ]),
    paymentPreflightPipes,
  );

  const urlSigner = new UrlSigner(resolved.appKey);
  const cancelTransaction = new CancelTransactionAction(models.transactions, events);
  const retryPayment = new RetryPaymentAction(services.buildRequestPayload);
  const canRetryPayment = new CanRetryPaymentAction(resolved);
  const createRetryAttempt = new CreateRetryPaymentAttemptAction(
    resolved,
    storage,
    retryPayment,
    canRetryPayment,
  );
  const refundTransaction = new RefundTransactionAction(
    storage,
    new BuildRefundRequestAction(resolved, credentialsResolver),
    events,
  );

  const handlers = new SispHttpHandlers({
    config: resolved,
    db,
    manager: services.manager,
    paymentPipeline,
    callbackPipeline: services.callbackPipeline,
    transactions: models.transactions,
    attempts: models.transactionAttempts,
    paymentIntents: models.paymentIntents,
    invoices: models.invoices,
    storeMetadata,
    updateInvoiceStatus: services.updateInvoiceStatus,
    buildSandboxPayload: services.buildSandboxPayload,
    cancelTransaction,
    retryPayment,
    createRetryAttempt,
    canRetryPayment,
    refundTransaction,
    rateLimits,
    urlSigner,
  });

  return new Sisp(
    resolved,
    db,
    storage,
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
