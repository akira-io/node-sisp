import type { CancelTransactionAction } from '../actions/cancel-transaction';
import type { StoreRequestMetadataAction } from '../actions/store-request-metadata';
import type { UpdateInvoiceStatusAction } from '../actions/update-invoice-status';
import { type ResolvedSispConfig, routeUrl } from '../config';
import type { Invoice } from '../database/models/invoice';
import type { Transaction } from '../database/models/transaction';
import type { SispManager } from '../drivers/sisp-manager';
import {
  BlacklistedIdentifierError,
  RateLimitExceededError,
  TransactionNotFoundError,
  TransactionStateError,
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
import { paymentRequestToFormFields } from '../value-objects/payment-request';
import { paymentRequestDataFrom } from '../value-objects/payment-request-data';
import { renderAutoSubmitForm } from './auto-submit-form';
import { paymentResponseData } from './payment-response';
import type { HttpRequestInfo } from './request-info';
import { html, type HttpResult, json, redirect } from './results';
import { validatePaymentInput } from './validate-payment-input';

export interface SispHandlersDeps {
  config: ResolvedSispConfig;
  manager: SispManager;
  paymentPipeline: ProcessPaymentPipeline;
  callbackPipeline: HandleCallbackPipeline;
  transactions: Transaction;
  invoices: Invoice;
  storeMetadata: StoreRequestMetadataAction;
  updateInvoiceStatus: UpdateInvoiceStatusAction;
  buildSandboxPayload: BuildSandboxPayloadAction;
  cancelTransaction: CancelTransactionAction;
  urlSigner: UrlSigner;
}

export class SispHttpHandlers {
  private readonly config: ResolvedSispConfig;
  private readonly manager: SispManager;
  private readonly paymentPipeline: ProcessPaymentPipeline;
  private readonly callbackPipeline: HandleCallbackPipeline;
  private readonly transactions: Transaction;
  private readonly invoices: Invoice;
  private readonly storeMetadata: StoreRequestMetadataAction;
  private readonly updateInvoiceStatus: UpdateInvoiceStatusAction;
  private readonly buildSandboxPayload: BuildSandboxPayloadAction;
  private readonly cancelTransaction: CancelTransactionAction;
  private readonly urlSigner: UrlSigner;

  constructor(deps: SispHandlersDeps) {
    this.config = deps.config;
    this.manager = deps.manager;
    this.paymentPipeline = deps.paymentPipeline;
    this.callbackPipeline = deps.callbackPipeline;
    this.transactions = deps.transactions;
    this.invoices = deps.invoices;
    this.storeMetadata = deps.storeMetadata;
    this.updateInvoiceStatus = deps.updateInvoiceStatus;
    this.buildSandboxPayload = deps.buildSandboxPayload;
    this.cancelTransaction = deps.cancelTransaction;
    this.urlSigner = deps.urlSigner;
  }

  async handleCancel(request: HttpRequestInfo): Promise<HttpResult> {
    if (!this.urlSigner.validate(`${this.config.basePath}/cancel`, request.query)) {
      return json({ message: 'Invalid signature.' }, 403);
    }

    const transaction = await this.resolveCancellable(request.query);

    if (transaction === null) {
      return json({ message: 'Transaction not found.' }, 404);
    }

    const reason = typeof request.query.reason === 'string' ? request.query.reason : 'user_cancelled';

    try {
      const cancelled = await this.cancelTransaction.handle(transaction, reason);

      return redirect(
        `${routeUrl(this.config, 'callback')}?ref=${encodeURIComponent(cancelled.merchant_ref)}`,
      );
    } catch (error) {
      if (error instanceof TransactionStateError) {
        return json({ message: error.message }, 400);
      }

      throw error;
    }
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
      const context = await this.paymentPipeline.run(
        new PaymentContext(paymentRequestDataFrom(request.body), request),
      );

      const fields = paymentRequestToFormFields(context.requirePaymentRequest());

      return html(
        renderAutoSubmitForm(this.formAction(fields), fields, 'SISP - Redirecting to payment'),
      );
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

    return json(paymentResponseData(this.config, transaction, invoice));
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

  private async resolveCancellable(query: Record<string, unknown>) {
    const merchantRef = query.merchantRef;

    if (typeof merchantRef === 'string' && merchantRef !== '') {
      return this.transactions.findByRef(merchantRef);
    }

    const transactionId = query.transaction_id;

    if (typeof transactionId === 'string' && transactionId !== '') {
      return this.transactions.findByGatewayTransactionId(transactionId);
    }

    return null;
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

  private async isAlreadyProcessed(merchantRef: string, merchantSession: string): Promise<boolean> {
    const transaction = await this.transactions.findByRefAndSession(merchantRef, merchantSession);

    return transaction !== null && transaction.transaction_id !== null;
  }

  private formAction(fields: Record<string, string | number>): string {
    const endpoint = this.manager.driver().paymentEndpoint();
    const extras = new URLSearchParams({
      FingerPrint: String(fields.fingerprint ?? ''),
      TimeStamp: String(fields.timeStamp ?? ''),
      FingerPrintVersion: String(fields.fingerprintversion ?? ''),
    });

    return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${extras.toString()}`;
  }

  private guardErrorResult(error: unknown): HttpResult {
    if (error instanceof BlacklistedIdentifierError) {
      return json({ message: error.message }, 403);
    }

    if (error instanceof RateLimitExceededError) {
      return json({ message: error.message }, 429);
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
