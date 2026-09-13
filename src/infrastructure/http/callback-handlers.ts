import type { CancelTransactionAction } from '../../application/actions/cancel-transaction';
import type { StoreRequestMetadataAction } from '../../application/actions/store-request-metadata';
import type { UpdateInvoiceStatusAction } from '../../application/actions/update-invoice-status';
import type { ResolvedSispConfig } from '../../application/config';
import type { SispEventEmitter } from '../../application/events';
import { type SispSideEffect, SispSideEffects } from '../../application/side-effects';
import type {
  CallbackVerifier,
  StoredCallbackOutcome,
} from '../../core/contracts/callback-verifier';
import type {
  InvoiceRepository,
  TransactionAttemptRepository,
  TransactionRepository,
} from '../../core/contracts/storage';
import {
  type CallbackRejectionReason,
  CallbackRejectionReasons,
} from '../../domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../../domain/enums/transaction-status';
import { TransactionNotFoundError } from '../../domain/errors/exceptions';
import type { TransactionAttemptRecord } from '../../domain/records';
import {
  type CallbackPayload,
  callbackPayloadFrom,
} from '../../domain/value-objects/callback-payload';
import type { UrlSigner } from '../../support/signed-url';
import {
  cancellationPayloadFrom,
  cancelUserCancelledTransaction,
  frontendResultUrl,
  isAlreadyProcessed,
  isUserCancelled,
  signedCallbackResultUrl,
} from './callback-processing';
import type { LifecycleHandlers } from './lifecycle-handlers';
import { paymentResponseData } from './payment-response';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, json, redirect } from './results';

export interface CallbackHandlersDeps {
  config: ResolvedSispConfig;
  transactions: TransactionRepository;
  attempts: TransactionAttemptRepository;
  invoices: InvoiceRepository;
  verifier: CallbackVerifier<StoredCallbackOutcome>;
  storeMetadata: StoreRequestMetadataAction;
  updateInvoiceStatus: UpdateInvoiceStatusAction;
  cancelTransaction: CancelTransactionAction;
  urlSigner: UrlSigner;
  events: SispEventEmitter;
  lifecycle: LifecycleHandlers;
}

export class CallbackHandlers {
  constructor(private readonly deps: CallbackHandlersDeps) {}

  async handle(request: HttpRequestInfo): Promise<HttpResult> {
    if (isUserCancelled(request)) {
      return this.handleUserCancelled(request);
    }

    if (request.method.toUpperCase() === 'GET') {
      return this.handleResult(request);
    }

    return this.handleNotification(request);
  }

  private async handleUserCancelled(request: HttpRequestInfo): Promise<HttpResult> {
    const { transactions, cancelTransaction, events, config } = this.deps;
    const payload = cancellationPayloadFrom(request);

    const cancelled = await this.runQuietly(
      () => cancelUserCancelledTransaction(transactions, cancelTransaction, payload),
      false,
      SispSideEffects.CancelUserCancelledTransaction,
    );

    if (cancelled) {
      events.emit('callback:rejected', {
        payload,
        status: TransactionStatus.Cancelled,
        reason: CallbackRejectionReasons.UserCancelled,
      });
    }

    return redirect(config.redirectUrl);
  }

  private async handleResult(request: HttpRequestInfo): Promise<HttpResult> {
    const { config, urlSigner, transactions, invoices, lifecycle } = this.deps;

    if (!urlSigner.validateExpiring(`${config.basePath}/callback`, request.query)) {
      return redirect(config.redirectUrl);
    }

    const transactionId = Number(request.query.transaction);

    if (!Number.isInteger(transactionId)) {
      return redirect(config.redirectUrl);
    }

    const transaction = await transactions.findById(transactionId);

    if (transaction === null) {
      return redirect(config.redirectUrl);
    }

    const invoice = await invoices.findByTransaction(transaction.id);
    const retry = await lifecycle.retryAvailability(transaction);
    const attempt = await this.runQuietly<TransactionAttemptRecord | null>(
      () => this.deps.attempts.currentByTransaction(transaction.id),
      null,
      SispSideEffects.LoadCurrentAttempt,
    );

    return json(paymentResponseData(transaction, invoice, retry, attempt));
  }

  private async handleNotification(request: HttpRequestInfo): Promise<HttpResult> {
    const {
      config,
      transactions,
      attempts,
      verifier,
      storeMetadata,
      updateInvoiceStatus,
      urlSigner,
    } = this.deps;
    const payload = callbackPayloadFrom(request.body);

    if (payload.merchantRef === '' || payload.merchantSession === '') {
      return redirect(config.redirectUrl);
    }

    if (await isAlreadyProcessed(transactions, attempts, payload)) {
      this.rejectCallback(payload, CallbackRejectionReasons.Replayed);

      return redirect(config.redirectUrl);
    }

    let outcome: StoredCallbackOutcome;

    try {
      outcome = await verifier.verify(payload);
    } catch (error) {
      if (error instanceof TransactionNotFoundError) {
        this.rejectCallback(payload, CallbackRejectionReasons.UnknownTransaction);

        return redirect(config.redirectUrl);
      }

      throw error;
    }

    if (outcome.replay || outcome.reason === CallbackRejectionReasons.InvalidFingerprint) {
      return redirect(config.redirectUrl);
    }

    const transaction = outcome.transaction;

    if (config.security.collectMetadata) {
      await this.runQuietly(
        () => storeMetadata.handle(request, transaction.id),
        undefined,
        SispSideEffects.StoreRequestMetadata,
      );
    }
    await this.runQuietly(
      () => updateInvoiceStatus.handle(transaction),
      undefined,
      SispSideEffects.UpdateInvoiceStatus,
    );

    if (config.frontendResultUrl) {
      return redirect(frontendResultUrl(config.frontendResultUrl, transaction.merchant_ref));
    }

    return redirect(signedCallbackResultUrl(config, urlSigner, transaction.id));
  }

  private rejectCallback(payload: CallbackPayload, reason: CallbackRejectionReason): void {
    this.deps.events.emit('callback:rejected', { payload, status: null, reason });
  }

  private async runQuietly<T>(
    operation: () => Promise<T>,
    fallback: T,
    sideEffect: SispSideEffect,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      try {
        this.deps.config.onSideEffectError?.(sideEffect, error);
      } catch {}

      return fallback;
    }
  }
}
