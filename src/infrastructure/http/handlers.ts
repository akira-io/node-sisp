import type { CanRetryPaymentAction } from '../../application/actions/can-retry-payment';
import type { CancelTransactionAction } from '../../application/actions/cancel-transaction';
import type { CreateRetryPaymentAttemptAction } from '../../application/actions/create-retry-payment-attempt';
import type { RefundTransactionAction } from '../../application/actions/refund-transaction';
import type { RetryPaymentAction } from '../../application/actions/retry-payment';
import type { StoreRequestMetadataAction } from '../../application/actions/store-request-metadata';
import type { UpdateInvoiceStatusAction } from '../../application/actions/update-invoice-status';
import type { ResolvedSispConfig } from '../../application/config';
import type { SispEventEmitter } from '../../application/events';
import type { ProcessPaymentPipeline } from '../../application/pipelines/payment/process-payment-pipeline';
import type { BuildSandboxPayloadAction } from '../../application/sandbox';
import type {
  CallbackVerifier,
  StoredCallbackOutcome,
} from '../../core/contracts/callback-verifier';
import type {
  InvoiceRepository,
  PaymentIntentRepository,
  RateLimitRepository,
  TransactionAttemptRepository,
  TransactionRepository,
} from '../../core/contracts/storage';
import {
  BlacklistedIdentifierError,
  PaymentIntentAlreadyProcessingError,
  PaymentRetryLimitExceededError,
  RateLimitExceededError,
} from '../../domain/errors/exceptions';
import {
  type PaymentRequest,
  paymentRequestToFormFields,
} from '../../domain/value-objects/payment-request';
import type { UrlSigner } from '../../support/signed-url';
import { fromCents } from '../../support/sisp-amount';
import type { SispManager } from '../drivers/sisp-manager';
import { renderAutoSubmitForm } from './auto-submit-form';
import { CallbackHandlers } from './callback-handlers';
import { buildGatewayFormAction } from './gateway-form-action';
import { LifecycleHandlers } from './lifecycle-handlers';
import { PaymentContextResolver } from './payment-context-resolver';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json, redirect } from './results';
import { SandboxHandlers } from './sandbox-handlers';
import type { StatelessHttpHandlers } from './stateless-handlers';
import { validatePaymentInput } from './validate-payment-input';

export interface SispHandlersDeps {
  config: ResolvedSispConfig;
  manager: SispManager;
  paymentPipeline: ProcessPaymentPipeline;
  callbackVerifier: CallbackVerifier<StoredCallbackOutcome>;
  transactions: TransactionRepository;
  attempts: TransactionAttemptRepository;
  paymentIntents: PaymentIntentRepository;
  invoices: InvoiceRepository;
  storeMetadata: StoreRequestMetadataAction;
  updateInvoiceStatus: UpdateInvoiceStatusAction;
  buildSandboxPayload: BuildSandboxPayloadAction;
  cancelTransaction: CancelTransactionAction;
  retryPayment: RetryPaymentAction;
  createRetryAttempt: CreateRetryPaymentAttemptAction;
  canRetryPayment: CanRetryPaymentAction;
  refundTransaction: RefundTransactionAction;
  rateLimits: RateLimitRepository;
  urlSigner: UrlSigner;
  events: SispEventEmitter;
}

export class SispHttpHandlers implements StatelessHttpHandlers {
  private readonly config: ResolvedSispConfig;
  private readonly manager: SispManager;
  private readonly transactions: TransactionRepository;
  private readonly lifecycle: LifecycleHandlers;
  private readonly paymentContexts: PaymentContextResolver;
  private readonly callbackHandlers: CallbackHandlers;
  private readonly sandboxHandlers: SandboxHandlers;

  constructor(deps: SispHandlersDeps) {
    this.config = deps.config;
    this.manager = deps.manager;
    this.transactions = deps.transactions;
    this.sandboxHandlers = new SandboxHandlers({
      config: deps.config,
      buildSandboxPayload: deps.buildSandboxPayload,
    });
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
    this.callbackHandlers = new CallbackHandlers({
      config: deps.config,
      transactions: deps.transactions,
      attempts: deps.attempts,
      invoices: deps.invoices,
      verifier: deps.callbackVerifier,
      storeMetadata: deps.storeMetadata,
      updateInvoiceStatus: deps.updateInvoiceStatus,
      cancelTransaction: deps.cancelTransaction,
      urlSigner: deps.urlSigner,
      events: deps.events,
      lifecycle: this.lifecycle,
    });
  }

  async handleRefund(request: HttpRequestInfo, transactionId: number): Promise<HttpResult> {
    return this.lifecycle.handleRefund(request, transactionId);
  }
  async handleTransactionStatus(merchantRef: string): Promise<HttpResult> {
    const transaction = await this.transactions.findByRef(merchantRef);

    if (!transaction) {
      return json({ message: 'Transaction not found.' }, 404);
    }

    return json({
      ref: transaction.merchant_ref,
      status: transaction.status,
      amount: fromCents(transaction.amount_cents),
      messageType: transaction.message_type,
      detail: transaction.merchant_response,
    });
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

  async handlePaymentIntent(request: HttpRequestInfo): Promise<HttpResult> {
    const validation = validatePaymentInput(request.body, this.config.paymentValidation);

    if (!validation.valid) {
      return json({ message: 'The given data was invalid.', errors: validation.errors }, 422);
    }

    try {
      const paymentRequest = (await this.paymentContexts.resolve(request)).requirePaymentRequest();
      const fields = paymentRequestToFormFields(paymentRequest);

      return json({
        action: buildGatewayFormAction(this.manager, fields),
        fields,
        ref: paymentRequest.merchantRef,
      });
    } catch (error) {
      return this.guardErrorResult(error);
    }
  }

  async handleCallback(request: HttpRequestInfo): Promise<HttpResult> {
    return this.callbackHandlers.handle(request);
  }

  async handleSandbox(request: HttpRequestInfo): Promise<HttpResult> {
    return this.sandboxHandlers.handleSandbox(request);
  }

  handleCountries(): HttpResult {
    return this.sandboxHandlers.handleCountries();
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
}
