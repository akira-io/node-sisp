import type { Knex } from 'knex';
import type { CanRetryPaymentAction } from '../../application/actions/can-retry-payment';
import type { CancelTransactionAction } from '../../application/actions/cancel-transaction';
import type { CreateRetryPaymentAttemptAction } from '../../application/actions/create-retry-payment-attempt';
import type { RefundTransactionAction } from '../../application/actions/refund-transaction';
import type { RetryPaymentAction } from '../../application/actions/retry-payment';
import type { StoreRequestMetadataAction } from '../../application/actions/store-request-metadata';
import type { UpdateInvoiceStatusAction } from '../../application/actions/update-invoice-status';
import { type ResolvedSispConfig, routeUrl } from '../../application/config';
import { CallbackContext } from '../../application/pipelines/callback/callback-context';
import type { HandleCallbackPipeline } from '../../application/pipelines/callback/handle-callback-pipeline';
import type { ProcessPaymentPipeline } from '../../application/pipelines/payment/process-payment-pipeline';
import type { BuildSandboxPayloadAction } from '../../application/sandbox';
import {
  BlacklistedIdentifierError,
  PaymentIntentAlreadyProcessingError,
  PaymentRetryLimitExceededError,
  RateLimitExceededError,
  TransactionNotFoundError,
} from '../../domain/errors/exceptions';
import {
  callbackPayloadFrom,
  callbackPayloadToFormFields,
} from '../../domain/value-objects/callback-payload';
import {
  type PaymentRequest,
  paymentRequestToFormFields,
} from '../../domain/value-objects/payment-request';
import { paymentRequestDataFrom } from '../../domain/value-objects/payment-request-data';
import { allCountries } from '../../support/countries';
import type { UrlSigner } from '../../support/signed-url';
import type { Invoice } from '../database/models/invoice';
import type { PaymentIntent } from '../database/models/payment-intent';
import type { RateLimit } from '../database/models/rate-limit';
import type { Transaction } from '../database/models/transaction';
import type { TransactionAttempt } from '../database/models/transaction-attempt';
import type { SispManager } from '../drivers/sisp-manager';
import { renderAutoSubmitForm } from './auto-submit-form';
import {
  booleanFromInput,
  cancelUserCancelledTransaction,
  isAlreadyProcessed,
  signedCallbackResultUrl,
} from './callback-processing';
import { buildGatewayFormAction } from './gateway-form-action';
import { LifecycleHandlers } from './lifecycle-handlers';
import { PaymentContextResolver } from './payment-context-resolver';
import { paymentResponseData } from './payment-response';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json, redirect } from './results';
import { validatePaymentInput } from './validate-payment-input';

export interface SispHandlersDeps {
  config: ResolvedSispConfig;
  db: Knex;
  manager: SispManager;
  paymentPipeline: ProcessPaymentPipeline;
  callbackPipeline: HandleCallbackPipeline;
  transactions: Transaction;
  attempts: TransactionAttempt;
  paymentIntents: PaymentIntent;
  invoices: Invoice;
  storeMetadata: StoreRequestMetadataAction;
  updateInvoiceStatus: UpdateInvoiceStatusAction;
  buildSandboxPayload: BuildSandboxPayloadAction;
  cancelTransaction: CancelTransactionAction;
  retryPayment: RetryPaymentAction;
  createRetryAttempt: CreateRetryPaymentAttemptAction;
  canRetryPayment: CanRetryPaymentAction;
  refundTransaction: RefundTransactionAction;
  rateLimits: RateLimit;
  urlSigner: UrlSigner;
}

export class SispHttpHandlers {
  private readonly config: ResolvedSispConfig;
  private readonly manager: SispManager;
  private readonly callbackPipeline: HandleCallbackPipeline;
  private readonly transactions: Transaction;
  private readonly attempts: TransactionAttempt;
  private readonly invoices: Invoice;
  private readonly storeMetadata: StoreRequestMetadataAction;
  private readonly updateInvoiceStatus: UpdateInvoiceStatusAction;
  private readonly buildSandboxPayload: BuildSandboxPayloadAction;
  private readonly lifecycle: LifecycleHandlers;
  private readonly paymentContexts: PaymentContextResolver;
  private readonly urlSigner: UrlSigner;
  private readonly cancelTransaction: CancelTransactionAction;

  constructor(deps: SispHandlersDeps) {
    this.config = deps.config;
    this.manager = deps.manager;
    this.callbackPipeline = deps.callbackPipeline;
    this.transactions = deps.transactions;
    this.cancelTransaction = deps.cancelTransaction;
    this.attempts = deps.attempts;
    this.invoices = deps.invoices;
    this.storeMetadata = deps.storeMetadata;
    this.updateInvoiceStatus = deps.updateInvoiceStatus;
    this.buildSandboxPayload = deps.buildSandboxPayload;
    this.urlSigner = deps.urlSigner;
    this.paymentContexts = new PaymentContextResolver({
      config: deps.config,
      paymentPipeline: deps.paymentPipeline,
      transactions: deps.transactions,
      attempts: deps.attempts,
      paymentIntents: deps.paymentIntents,
      createRetryAttempt: deps.createRetryAttempt,
      canRetryPayment: deps.canRetryPayment,
    });
    this.lifecycle = new LifecycleHandlers({
      config: deps.config,
      db: deps.db,
      manager: deps.manager,
      transactions: deps.transactions,
      attempts: deps.attempts,
      cancelTransaction: deps.cancelTransaction,
      retryPayment: deps.retryPayment,
      createRetryAttempt: deps.createRetryAttempt,
      canRetryPayment: deps.canRetryPayment,
      refundTransaction: deps.refundTransaction,
      rateLimits: deps.rateLimits,
      urlSigner: deps.urlSigner,
    });
  }

  async handleRefund(request: HttpRequestInfo, transactionId: number): Promise<HttpResult> {
    return this.lifecycle.handleRefund(request, transactionId);
  }
  async handleRetryPayment(request: HttpRequestInfo): Promise<HttpResult> {
    return this.lifecycle.handleRetryPayment(request);
  }
  async handleCancel(request: HttpRequestInfo): Promise<HttpResult> {
    return this.lifecycle.handleCancel(request);
  }
  signedRetryUrl(transactionId: number): string {
    return this.lifecycle.signedRetryUrl(transactionId);
  }

  async handlePayment(request: HttpRequestInfo): Promise<HttpResult> {
    const validation = validatePaymentInput(request.body, this.config.paymentValidation);

    if (!validation.valid) {
      return json({ message: 'The given data was invalid.', errors: validation.errors }, 422);
    }

    if (await this.isDuplicateSubmission(request.body)) {
      return redirect('/');
    }

    try {
      return this.renderPaymentForm(
        (await this.paymentContexts.resolve(request)).requirePaymentRequest(),
      );
    } catch (error) {
      return this.guardErrorResult(error);
    }
  }

  async handleCallback(request: HttpRequestInfo): Promise<HttpResult> {
    if (booleanFromInput(request.body.UserCancelled ?? request.query.UserCancelled)) {
      await this.runQuietly(() =>
        cancelUserCancelledTransaction(this.transactions, this.cancelTransaction, request),
      );

      return redirect(this.config.redirectUrl);
    }

    if (request.method.toUpperCase() === 'GET') {
      return this.handleCallbackResult(request);
    }

    return this.handleCallbackNotification(request);
  }

  async handleSandbox(request: HttpRequestInfo): Promise<HttpResult> {
    if (!this.config.sandbox) {
      return json({ message: 'Not Found' }, 404);
    }

    const input = { ...request.query, ...request.body };
    const status = typeof input.status === 'string' ? input.status : 'success';

    const payload = this.buildSandboxPayload.handle(
      paymentRequestDataFrom({ ...input, amount: input.amount ?? '0' }),
      status,
    );

    return html(
      renderAutoSubmitForm(
        routeUrl(this.config, 'callback'),
        callbackPayloadToFormFields(payload),
        'SISP Sandbox - Processing',
      ),
    );
  }

  handleCountries(): HttpResult {
    return json(allCountries());
  }

  private async handleCallbackResult(request: HttpRequestInfo): Promise<HttpResult> {
    if (!this.urlSigner.validate(`${this.config.basePath}/callback`, request.query)) {
      return redirect(this.config.redirectUrl);
    }

    const transactionId = Number(request.query.transaction);

    if (!Number.isInteger(transactionId)) {
      return redirect(this.config.redirectUrl);
    }

    const transaction = await this.transactions.findById(transactionId);

    if (transaction === null) {
      return redirect(this.config.redirectUrl);
    }

    const invoice = await this.invoices.findByTransaction(transaction.id);
    const retry = await this.lifecycle.retryAvailability(transaction);

    return json(paymentResponseData(transaction, invoice, retry));
  }

  private async handleCallbackNotification(request: HttpRequestInfo): Promise<HttpResult> {
    const payload = callbackPayloadFrom(request.body);

    if (payload.merchantRef === '' || payload.merchantSession === '') {
      return redirect(this.config.redirectUrl);
    }

    if (
      await isAlreadyProcessed(
        this.transactions,
        this.attempts,
        payload.merchantRef,
        payload.merchantSession,
      )
    ) {
      return redirect(this.config.redirectUrl);
    }

    let context: CallbackContext;

    try {
      context = await this.callbackPipeline.run(new CallbackContext(payload));
    } catch (error) {
      if (error instanceof TransactionNotFoundError) {
        return redirect(this.config.redirectUrl);
      }

      throw error;
    }

    const transaction = context.requireTransaction();

    await this.runQuietly(() => this.storeMetadata.handle(request, transaction.id));
    await this.runQuietly(() => this.updateInvoiceStatus.handle(transaction));

    return redirect(signedCallbackResultUrl(this.config, this.urlSigner, transaction.id));
  }

  private async isDuplicateSubmission(body: Record<string, unknown>): Promise<boolean> {
    const merchantRef = body.merchantRef;
    const merchantSession = body.merchantSession;

    if (typeof merchantRef !== 'string' || typeof merchantSession !== 'string') {
      return false;
    }

    const existing = await this.transactions.findByRefAndSession(merchantRef, merchantSession);

    return existing !== null && ['completed', 'failed', 'pending'].includes(existing.status);
  }

  private renderPaymentForm(paymentRequest: PaymentRequest): HttpResult {
    const fields = paymentRequestToFormFields(paymentRequest);

    return html(
      renderAutoSubmitForm(
        buildGatewayFormAction(this.manager, fields),
        fields,
        'SISP - Redirecting to payment',
      ),
    );
  }

  private guardErrorResult(error: unknown): HttpResult {
    if (error instanceof BlacklistedIdentifierError) {
      return json({ message: error.message }, 403);
    }
    if (error instanceof RateLimitExceededError) {
      return json({ message: error.message }, 429);
    }
    if (error instanceof PaymentIntentAlreadyProcessingError) {
      return json({ message: error.message }, 409);
    }
    if (error instanceof PaymentRetryLimitExceededError) {
      return json({ message: error.message }, 409);
    }
    throw error;
  }

  private async runQuietly(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {}
  }
}
