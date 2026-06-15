import { BuildRequestPayloadAction } from './actions/build-request-payload';
import { FailTransactionAction } from './actions/fail-transaction';
import { ReconcileTransactionStatusAction } from './actions/reconcile-transaction-status';
import { UpdateInvoiceStatusAction } from './actions/update-invoice-status';
import type { ResolvedSispConfig } from './config';
import type { CredentialsResolver } from './contracts/credentials-resolver';
import type { CallbackPipe, PaymentPipe } from './contracts/pipes';
import { createSispManager, type SispManager } from './drivers/sisp-manager';
import type { SispEventEmitter } from './events';
import { HandleCallbackPipeline } from './pipelines/callback/handle-callback-pipeline';
import { ApplyTransactionStatus } from './pipelines/callback/pipes/apply-transaction-status';
import { DispatchPaymentEvents } from './pipelines/callback/pipes/dispatch-payment-events';
import { EnsureCallbackMatchesTransaction } from './pipelines/callback/pipes/ensure-callback-matches-transaction';
import { ResolveTransaction } from './pipelines/callback/pipes/resolve-transaction';
import { ValidateFingerprint } from './pipelines/callback/pipes/validate-fingerprint';
import { BuildSandboxPayloadAction } from './sandbox';
import type { SispModels } from './sisp';

export interface CredentialScopedServices {
  manager: SispManager;
  buildRequestPayload: BuildRequestPayloadAction;
  buildSandboxPayload: BuildSandboxPayloadAction;
  callbackPipeline: HandleCallbackPipeline;
  updateInvoiceStatus: UpdateInvoiceStatusAction;
  reconcileTransaction: ReconcileTransactionStatusAction;
}

export function wireCredentialScopedServices(
  config: ResolvedSispConfig,
  events: SispEventEmitter,
  models: SispModels,
  credentialsResolver: CredentialsResolver,
): CredentialScopedServices {
  const manager = createSispManager(config, credentialsResolver);
  const buildRequestPayload = new BuildRequestPayloadAction(config, credentialsResolver);
  const buildSandboxPayload = new BuildSandboxPayloadAction(config, credentialsResolver);
  const failTransaction = new FailTransactionAction(
    models.transactions,
    models.transactionAttempts,
  );
  const updateInvoiceStatus = new UpdateInvoiceStatusAction(models.invoices);

  const callbackPipeline = new HandleCallbackPipeline(
    customizePipes(config.pipelines.callback, [
      new ResolveTransaction(models.transactions, models.transactionAttempts),
      new ValidateFingerprint(credentialsResolver, failTransaction, events),
      new EnsureCallbackMatchesTransaction(config, credentialsResolver, failTransaction, events),
      new ApplyTransactionStatus(models.transactions, models.transactionAttempts),
      new DispatchPaymentEvents(events),
    ]),
  );

  const reconcileTransaction = new ReconcileTransactionStatusAction(
    manager,
    models.transactions,
    updateInvoiceStatus,
  );

  return {
    manager,
    buildRequestPayload,
    buildSandboxPayload,
    callbackPipeline,
    updateInvoiceStatus,
    reconcileTransaction,
  };
}

export function customizePipes<TPipe extends PaymentPipe | CallbackPipe>(
  customize: ((defaults: TPipe[]) => TPipe[]) | undefined,
  defaults: TPipe[],
): TPipe[] {
  return customize ? customize(defaults) : defaults;
}
