import type { Knex } from 'knex';
import type { BuildRequestPayloadAction } from './actions/build-request-payload';
import type { CancelTransactionAction } from './actions/cancel-transaction';
import type { ReconcileTransactionStatusAction } from './actions/reconcile-transaction-status';
import type { RefundTransactionAction } from './actions/refund-transaction';
import { RefundBuilder } from './builders/refund-builder';
import type { ResolvedSispConfig } from './config';
import type { CredentialsResolver } from './contracts/credentials-resolver';
import type { SispDriver } from './contracts/sisp-driver';
import type { TransactionRecord } from './database/records';
import type { Blacklist } from './database/models/blacklist';
import type { Invoice } from './database/models/invoice';
import type { TransactionItem } from './database/models/transaction-item';
import type { TransactionLog } from './database/models/transaction-log';
import type { Transaction } from './database/models/transaction';
import type { SispManager } from './drivers/sisp-manager';
import type { SispEventEmitter, SispEventMap, SispEventName } from './events';
import { validateCallbackFingerprint } from './fingerprints/callback-fingerprint';
import { computeToken } from './fingerprints/token';
import type { SispHttpHandlers } from './http/handlers';
import { CallbackContext } from './pipelines/callback/callback-context';
import type { HandleCallbackPipeline } from './pipelines/callback/handle-callback-pipeline';
import type { BuildSandboxPayloadAction, SandboxStatus } from './sandbox';
import { PaymentBuilder } from './builders/payment-builder';
import type { UrlSigner } from './support/signed-url';
import { ScopedSisp } from './scoped-sisp';
import type { CallbackPayload } from './value-objects/callback-payload';
import type { PaymentRequest } from './value-objects/payment-request';
import type { PaymentRequestData } from './value-objects/payment-request-data';
import { type SispCredentials, sispCredentials } from './value-objects/sisp-credentials';
import type { TransactionStatusResponse } from './value-objects/transaction-status-response';

export interface SispModels {
  transactions: Transaction;
  transactionItems: TransactionItem;
  invoices: Invoice;
  transactionLogs: TransactionLog;
  blacklist: Blacklist;
}

export interface ReconcilePendingOptions {
  olderThanMinutes?: number;
  limit?: number;
  force?: boolean;
}

export interface ReconcilePendingResult {
  skipped: boolean;
  checked: number;
  reconciled: number;
}

export class Sisp {
  constructor(
    readonly config: ResolvedSispConfig,
    readonly db: Knex,
    readonly events: SispEventEmitter,
    readonly manager: SispManager,
    readonly models: SispModels,
    readonly handlers: SispHttpHandlers,
    private readonly credentialsResolver: CredentialsResolver,
    private readonly buildRequestPayloadAction: BuildRequestPayloadAction,
    private readonly buildSandboxPayloadAction: BuildSandboxPayloadAction,
    private readonly callbackPipeline: HandleCallbackPipeline,
    private readonly cancelTransaction: CancelTransactionAction,
    private readonly refundTransaction: RefundTransactionAction,
    private readonly reconcileTransaction: ReconcileTransactionStatusAction,
    private readonly urlSigner: UrlSigner,
  ) {}

  forCredentials(credentials: Partial<SispCredentials>): ScopedSisp {
    return new ScopedSisp(this.config, this.events, this.models, sispCredentials(credentials));
  }

  async queryTransactionStatus(
    transaction: TransactionRecord | string,
  ): Promise<TransactionStatusResponse> {
    const merchantRef = typeof transaction === 'string' ? transaction : transaction.merchant_ref;

    return this.manager.driver().queryTransactionStatus(merchantRef);
  }

  async reconcileTransactionStatus(transaction: TransactionRecord): Promise<TransactionRecord> {
    return this.reconcileTransaction.handle(transaction);
  }

  async reconcilePending(options: ReconcilePendingOptions = {}): Promise<ReconcilePendingResult> {
    const settings = this.config.transactionStatus;

    if (!settings.reconciliationEnabled && !options.force) {
      return { skipped: true, checked: 0, reconciled: 0 };
    }

    const olderThanMinutes = options.olderThanMinutes ?? settings.reconcileAfterMinutes;
    const limit = options.limit ?? settings.reconcileLimit;
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

    const pending = await this.models.transactions.listPendingForReconciliation(cutoff, limit);
    let reconciled = 0;

    for (const transaction of pending) {
      const updated = await this.reconcileTransaction.handle(transaction);

      if (updated.status !== transaction.status) {
        reconciled += 1;
      }
    }

    return { skipped: false, checked: pending.length, reconciled };
  }

  refund(transaction: TransactionRecord): RefundBuilder {
    return new RefundBuilder(this.refundTransaction, transaction);
  }

  async cancel(
    transaction: TransactionRecord,
    reason = 'user_cancelled',
  ): Promise<TransactionRecord> {
    return this.cancelTransaction.handle(transaction, reason);
  }

  signedCancelUrl(merchantRef: string, reason = 'user_cancelled'): string {
    const signedPath = this.urlSigner.sign(`${this.config.basePath}/cancel`, {
      merchantRef,
      reason,
    });

    return `${this.config.baseUrl}${signedPath}`;
  }

  signedRetryUrl(transactionId: number): string {
    return this.handlers.signedRetryUrl(transactionId);
  }

  payment(): PaymentBuilder {
    return new PaymentBuilder(this.buildRequestPayloadAction);
  }

  driver(name?: string | null): SispDriver {
    return this.manager.driver(name);
  }

  on<K extends SispEventName>(eventName: K, listener: (event: SispEventMap[K]) => unknown): this {
    this.events.on(eventName, listener);

    return this;
  }

  off<K extends SispEventName>(eventName: K, listener: (event: SispEventMap[K]) => unknown): this {
    this.events.off(eventName, listener);

    return this;
  }

  buildRequestPayload(data: PaymentRequestData): PaymentRequest {
    return this.buildRequestPayloadAction.handle(data);
  }

  validateCallback(payload: CallbackPayload): boolean {
    const token = computeToken(this.credentialsResolver.resolve().posAutCode);

    return validateCallbackFingerprint(token, payload);
  }

  async handlePaymentCallback(payload: CallbackPayload): Promise<TransactionRecord> {
    const context = await this.callbackPipeline.run(new CallbackContext(payload));

    return context.requireTransaction();
  }

  generateSandboxPayload(data: PaymentRequestData, status: SandboxStatus = 'success'): CallbackPayload {
    return this.buildSandboxPayloadAction.handle(data, status);
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }
}
