import type { Knex } from 'knex';
import type { CanRetryPaymentAction } from '../actions/can-retry-payment';
import type { CancelTransactionAction } from '../actions/cancel-transaction';
import type { CreateRetryPaymentAttemptAction } from '../actions/create-retry-payment-attempt';
import type { RefundTransactionAction } from '../actions/refund-transaction';
import type { RetryPaymentAction } from '../actions/retry-payment';
import type { StoreRequestMetadataAction } from '../actions/store-request-metadata';
import type { UpdateInvoiceStatusAction } from '../actions/update-invoice-status';
import { type ResolvedSispConfig, routeUrl } from '../config';
import type { Invoice } from '../database/models/invoice';
import type { PaymentIntent } from '../database/models/payment-intent';
import type { RateLimit } from '../database/models/rate-limit';
import type { Transaction } from '../database/models/transaction';
import type { TransactionAttempt } from '../database/models/transaction-attempt';
import { type TransactionRecord, transactionPayloadRecord } from '../database/records';
import type { SispManager } from '../drivers/sisp-manager';
import {
  BlacklistedIdentifierError,
  PaymentIntentAlreadyProcessingError,
  RateLimitExceededError,
  TransactionNotFoundError,
} from '../exceptions';
import { CallbackContext } from '../pipelines/callback/callback-context';
import type { HandleCallbackPipeline } from '../pipelines/callback/handle-callback-pipeline';
import { PaymentContext } from '../pipelines/payment/payment-context';
import type { ProcessPaymentPipeline } from '../pipelines/payment/process-payment-pipeline';
import type { BuildSandboxPayloadAction } from '../sandbox';
import { allCountries } from '../support/countries';
import type { UrlSigner } from '../support/signed-url';
import {
  callbackPayloadFrom,
  callbackPayloadToFormFields,
} from '../value-objects/callback-payload';
import { type PaymentRequest, paymentRequestToFormFields } from '../value-objects/payment-request';
import { paymentRequestDataFrom } from '../value-objects/payment-request-data';
import { renderAutoSubmitForm } from './auto-submit-form';
import { buildGatewayFormAction } from './gateway-form-action';
import { LifecycleHandlers } from './lifecycle-handlers';
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
  private readonly paymentPipeline: ProcessPaymentPipeline;
  private readonly callbackPipeline: HandleCallbackPipeline;
  private readonly transactions: Transaction;
  private readonly attempts: TransactionAttempt;
  private readonly paymentIntents: PaymentIntent;
  private readonly invoices: Invoice;
  private readonly storeMetadata: StoreRequestMetadataAction;
  private readonly updateInvoiceStatus: UpdateInvoiceStatusAction;
  private readonly buildSandboxPayload: BuildSandboxPayloadAction;
  private readonly createRetryAttempt: CreateRetryPaymentAttemptAction;
  private readonly canRetryPayment: CanRetryPaymentAction;
  private readonly lifecycle: LifecycleHandlers;

  constructor(deps: SispHandlersDeps) {
    this.config = deps.config;
    this.manager = deps.manager;
    this.paymentPipeline = deps.paymentPipeline;
    this.callbackPipeline = deps.callbackPipeline;
    this.transactions = deps.transactions;
    this.attempts = deps.attempts;
    this.paymentIntents = deps.paymentIntents;
    this.invoices = deps.invoices;
    this.storeMetadata = deps.storeMetadata;
    this.updateInvoiceStatus = deps.updateInvoiceStatus;
    this.buildSandboxPayload = deps.buildSandboxPayload;
    this.createRetryAttempt = deps.createRetryAttempt;
    this.canRetryPayment = deps.canRetryPayment;
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
    const validation = validatePaymentInput(request.body);

    if (!validation.valid) {
      return json({ message: 'The given data was invalid.', errors: validation.errors }, 422);
    }

    if (await this.isDuplicateSubmission(request.body)) {
      return redirect('/');
    }

    try {
      const context = await this.paymentContext(request);

      return this.renderPaymentForm(context.requirePaymentRequest());
    } catch (error) {
      return this.guardErrorResult(error);
    }
  }

  async handleCallback(request: HttpRequestInfo): Promise<HttpResult> {
    if (toBoolean(request.body.UserCancelled ?? request.query.UserCancelled)) {
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
    const merchantRef = request.query.ref;

    if (typeof merchantRef !== 'string' || merchantRef === '') {
      return redirect(this.config.redirectUrl);
    }

    const transaction = await this.transactions.findByRef(merchantRef);

    if (transaction === null) {
      return redirect(this.config.redirectUrl);
    }

    const invoice = await this.invoices.findByTransaction(transaction.id);

    return json(
      paymentResponseData(transaction, invoice, this.lifecycle.retryAvailability(transaction)),
    );
  }

  private async handleCallbackNotification(request: HttpRequestInfo): Promise<HttpResult> {
    const payload = callbackPayloadFrom(request.body);

    if (payload.merchantRef === '' || payload.merchantSession === '') {
      return redirect(this.config.redirectUrl);
    }

    if (await this.isAlreadyProcessed(payload.merchantRef, payload.merchantSession)) {
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

    return redirect(
      `${routeUrl(this.config, 'callback')}?ref=${encodeURIComponent(transaction.merchant_ref)}`,
    );
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

  private async paymentContext(request: HttpRequestInfo): Promise<PaymentContext> {
    const idempotencyKey = this.idempotencyKey(request.body);

    if (idempotencyKey === null) {
      return this.newPaymentContext(request);
    }

    if (!(await this.paymentIntents.reserve(idempotencyKey))) {
      return this.existingPaymentContext(request, idempotencyKey);
    }

    try {
      const context = await this.newPaymentContext(request);

      await this.paymentIntents.submit(idempotencyKey, context.requireTransaction().id);

      return context;
    } catch (error) {
      await this.paymentIntents.fail(idempotencyKey, errorMessage(error));

      throw error;
    }
  }

  private async newPaymentContext(request: HttpRequestInfo): Promise<PaymentContext> {
    return this.paymentPipeline.run(
      new PaymentContext(paymentRequestDataFrom(request.body), request),
    );
  }

  private async existingPaymentContext(
    request: HttpRequestInfo,
    idempotencyKey: string,
  ): Promise<PaymentContext> {
    const intent = await this.paymentIntents.findByKey(idempotencyKey);

    if (intent?.transaction_id == null) {
      throw new PaymentIntentAlreadyProcessingError(idempotencyKey);
    }

    const transaction = await this.transactions.findById(intent.transaction_id);

    if (transaction === null) {
      throw new PaymentIntentAlreadyProcessingError(idempotencyKey);
    }

    const context = new PaymentContext(paymentRequestDataFrom(request.body), request);
    context.transaction = transaction;

    if (this.canRetryPayment.handle(transaction)) {
      context.paymentRequest = await this.createRetryAttempt.handle(transaction);
      context.transaction = (await this.transactions.findById(transaction.id)) ?? transaction;

      return context;
    }

    context.paymentRequest = await this.paymentRequestFrom(transaction, idempotencyKey);

    return context;
  }

  private idempotencyKey(body: Record<string, unknown>): string | null {
    if (!this.config.idempotency.enabled) {
      return null;
    }

    for (const key of this.config.idempotency.requestKeys) {
      const value = body[key];

      if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
      }
    }

    return null;
  }

  private async paymentRequestFrom(
    transaction: TransactionRecord,
    idempotencyKey: string,
  ): Promise<PaymentRequest> {
    const attempts = await this.attempts.listByTransaction(transaction.id);
    const currentAttempt =
      attempts.find((attempt) => attempt.superseded_at === null) ?? attempts.at(-1);

    const paymentRequest =
      paymentRequestFromStoredPayload(currentAttempt?.payload) ??
      paymentRequestFromStoredPayload(transactionPayloadRecord(transaction));

    if (paymentRequest === null) {
      throw new PaymentIntentAlreadyProcessingError(idempotencyKey);
    }

    return paymentRequest;
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

  private async isAlreadyProcessed(merchantRef: string, merchantSession: string): Promise<boolean> {
    const attempt = await this.attempts.findByRefAndSession(merchantRef, merchantSession);

    if (attempt !== null) {
      return attempt.gateway_transaction_id !== null;
    }

    const transaction = await this.transactions.findByRefAndSession(merchantRef, merchantSession);

    return transaction !== null && transaction.transaction_id !== null;
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

    throw error;
  }

  private async runQuietly(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {
      // Post-completion work must never break the callback response.
    }
  }
}

function paymentRequestFromStoredPayload(payload: unknown): PaymentRequest | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const fields = payload as Record<string, unknown>;
  const amount = Number(fields.amount);

  if (
    typeof fields.posID !== 'string' ||
    typeof fields.merchantRef !== 'string' ||
    typeof fields.merchantSession !== 'string' ||
    !Number.isFinite(amount) ||
    typeof fields.currency !== 'string' ||
    typeof fields.is3DSec !== 'string' ||
    typeof fields.urlMerchantResponse !== 'string' ||
    typeof fields.languageMessages !== 'string' ||
    typeof fields.timeStamp !== 'string' ||
    typeof fields.fingerprintversion !== 'string' ||
    typeof fields.transactionCode !== 'string' ||
    typeof fields.fingerprint !== 'string'
  ) {
    return null;
  }

  return {
    posID: fields.posID,
    merchantRef: fields.merchantRef,
    merchantSession: fields.merchantSession,
    amount,
    currency: fields.currency,
    is3DSec: fields.is3DSec,
    urlMerchantResponse: fields.urlMerchantResponse,
    languageMessages: fields.languageMessages,
    timeStamp: fields.timeStamp,
    fingerprintversion: fields.fingerprintversion,
    transactionCode: fields.transactionCode,
    fingerprint: fields.fingerprint,
    token: typeof fields.token === 'string' ? fields.token : '',
    entityCode: typeof fields.entityCode === 'string' ? fields.entityCode : '',
    referenceNumber: typeof fields.referenceNumber === 'string' ? fields.referenceNumber : '',
    locale: typeof fields.locale === 'string' ? fields.locale : 'pt',
    purchaseRequest: typeof fields.purchaseRequest === 'string' ? fields.purchaseRequest : '',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'on', 'yes'].includes(value.toLowerCase());
  }

  return false;
}
