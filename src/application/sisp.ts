import type { CallbackVerifier, StoredCallbackOutcome } from '../core/contracts/callback-verifier';
import type { CredentialsResolver } from '../core/contracts/credentials-resolver';
import type {
  BlacklistRepository,
  InvoiceRepository,
  PaymentIntentRepository,
  SispStorage,
  TransactionAttemptRepository,
  TransactionItemRepository,
  TransactionLogRepository,
  TransactionRepository,
} from '../core/contracts/storage';
import { CallbackRejectionReasons } from '../domain/enums/callback-rejection-reason';
import type { CallbackPayload } from '../domain/value-objects/callback-payload';
import { type SispCredentials, sispCredentials } from '../domain/value-objects/sisp-credentials';
import type { TransactionStatusResponse } from '../domain/value-objects/transaction-status-response';
import type { SispManager } from '../infrastructure/drivers/sisp-manager';
import type { SispHttpHandlers } from '../infrastructure/http/handlers';
import type { TransactionRecord } from '../infrastructure/storage/knex/records';
import type { UrlSigner } from '../support/signed-url';
import type { BuildRequestPayloadAction } from './actions/build-request-payload';
import type { CancelTransactionAction } from './actions/cancel-transaction';
import type { ReconcileTransactionStatusAction } from './actions/reconcile-transaction-status';
import type { RefundTransactionAction } from './actions/refund-transaction';
import { RefundBuilder } from './builders/refund-builder';
import type { ResolvedSispConfig } from './config';
import type { SispEventEmitter } from './events';
import type { BuildSandboxPayloadAction } from './sandbox';
import { ScopedSisp } from './scoped-sisp';
import { StatelessSisp } from './stateless-sisp';

const CANCEL_URL_TTL_MINUTES = 30;

export interface SispModels {
  transactions: TransactionRepository;
  transactionItems: TransactionItemRepository;
  transactionAttempts: TransactionAttemptRepository;
  paymentIntents: PaymentIntentRepository;
  invoices: InvoiceRepository;
  transactionLogs: TransactionLogRepository;
  blacklist: BlacklistRepository;
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

export class Sisp extends StatelessSisp {
  private readonly statefulVerifier: CallbackVerifier<StoredCallbackOutcome>;

  declare readonly config: ResolvedSispConfig;
  declare readonly handlers: SispHttpHandlers;

  constructor(
    config: ResolvedSispConfig,
    readonly db: unknown,
    private readonly _storage: SispStorage,
    events: SispEventEmitter,
    manager: SispManager,
    readonly models: SispModels,
    handlers: SispHttpHandlers,
    credentialsResolver: CredentialsResolver,
    buildRequestPayloadAction: BuildRequestPayloadAction,
    buildSandboxPayloadAction: BuildSandboxPayloadAction,
    private readonly cancelTransaction: CancelTransactionAction,
    private readonly refundTransaction: RefundTransactionAction,
    private readonly reconcileTransaction: ReconcileTransactionStatusAction,
    private readonly urlSigner: UrlSigner,
    statefulVerifier: CallbackVerifier<StoredCallbackOutcome>,
  ) {
    super(
      config,
      events,
      manager,
      handlers,
      credentialsResolver,
      buildRequestPayloadAction,
      buildSandboxPayloadAction,
      statefulVerifier,
      true,
    );
    this.statefulVerifier = statefulVerifier;
  }

  get storage(): SispStorage {
    return this._storage;
  }

  override async handleCallback(payload: CallbackPayload): Promise<StoredCallbackOutcome> {
    return this.statefulVerifier.verify(payload);
  }

  override async queryTransactionStatus(
    transaction: TransactionRecord | string,
  ): Promise<TransactionStatusResponse> {
    const merchantRef = typeof transaction === 'string' ? transaction : transaction.merchant_ref;

    return this.manager.driver().queryTransactionStatus(merchantRef);
  }

  override async destroy(): Promise<void> {
    await this._storage.destroy();
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
    reason: string = CallbackRejectionReasons.UserCancelled,
  ): Promise<TransactionRecord> {
    return this.cancelTransaction.handle(transaction, reason);
  }

  signedCancelUrl(
    merchantRef: string,
    reason: string = CallbackRejectionReasons.UserCancelled,
  ): string {
    const signedPath = this.urlSigner.signAction(
      `${this.config.basePath}/cancel`,
      {
        merchantRef,
        reason,
      },
      new Date(Date.now() + CANCEL_URL_TTL_MINUTES * 60_000),
    );

    return `${this.config.baseUrl}${signedPath}`;
  }

  signedRetryUrl(transactionId: number): string {
    return this.handlers.signedRetryUrl(transactionId);
  }
}
