import type { Knex } from 'knex';
import type { CredentialsResolver } from '../core/contracts/credentials-resolver';
import type { SispDriver } from '../core/contracts/sisp-driver';
import type { SispStorage } from '../core/contracts/storage';
import type { CallbackPayload } from '../domain/value-objects/callback-payload';
import type { PaymentRequest } from '../domain/value-objects/payment-request';
import type { PaymentRequestData } from '../domain/value-objects/payment-request-data';
import { type SispCredentials, sispCredentials } from '../domain/value-objects/sisp-credentials';
import type { TransactionStatusResponse } from '../domain/value-objects/transaction-status-response';
import type { SispManager } from '../infrastructure/drivers/sisp-manager';
import { validateCallbackFingerprint } from '../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../infrastructure/fingerprints/token';
import type { SispHttpHandlers } from '../infrastructure/http/handlers';
import type { Blacklist } from '../infrastructure/storage/knex/models/blacklist';
import type { Invoice } from '../infrastructure/storage/knex/models/invoice';
import type { PaymentIntent } from '../infrastructure/storage/knex/models/payment-intent';
import type { Transaction } from '../infrastructure/storage/knex/models/transaction';
import type { TransactionAttempt } from '../infrastructure/storage/knex/models/transaction-attempt';
import type { TransactionItem } from '../infrastructure/storage/knex/models/transaction-item';
import type { TransactionLog } from '../infrastructure/storage/knex/models/transaction-log';
import type { TransactionRecord } from '../infrastructure/storage/knex/records';
import type { UrlSigner } from '../support/signed-url';
import type { BuildRequestPayloadAction } from './actions/build-request-payload';
import type { CancelTransactionAction } from './actions/cancel-transaction';
import type { ReconcileTransactionStatusAction } from './actions/reconcile-transaction-status';
import type { RefundTransactionAction } from './actions/refund-transaction';
import { PaymentBuilder } from './builders/payment-builder';
import { RefundBuilder } from './builders/refund-builder';
import type { ResolvedSispConfig } from './config';
import type { SispEventEmitter, SispEventMap, SispEventName } from './events';
import { CallbackContext } from './pipelines/callback/callback-context';
import type { HandleCallbackPipeline } from './pipelines/callback/handle-callback-pipeline';
import type { BuildSandboxPayloadAction, SandboxStatus } from './sandbox';
import { ScopedSisp } from './scoped-sisp';

export interface SispModels {
  transactions: Transaction;
  transactionItems: TransactionItem;
  transactionAttempts: TransactionAttempt;
  paymentIntents: PaymentIntent;
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
    private readonly _storage: SispStorage,
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

  get storage(): SispStorage {
    return this._storage;
  }

  forCredentials(credentials: Partial<SispCredentials>): ScopedSisp {
    return new ScopedSisp(
      this._storage,
      this.config,
      this.events,
      this.models,
      sispCredentials(credentials),
    );
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

  generateSandboxPayload(
    data: PaymentRequestData,
    status: SandboxStatus = 'success',
  ): CallbackPayload {
    return this.buildSandboxPayloadAction.handle(data, status);
  }

  async destroy(): Promise<void> {
    await this._storage.destroy();
  }
}
