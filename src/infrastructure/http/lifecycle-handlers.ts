import type { CanRetryPaymentAction } from '../../application/actions/can-retry-payment';
import type { CancelTransactionAction } from '../../application/actions/cancel-transaction';
import type { CreateRetryPaymentAttemptAction } from '../../application/actions/create-retry-payment-attempt';
import type { RefundTransactionAction } from '../../application/actions/refund-transaction';
import type { RetryPaymentAction } from '../../application/actions/retry-payment';
import type { RateLimitRule, ResolvedSispConfig } from '../../application/config';
import type {
  RateLimitRepository,
  TransactionAttemptRepository,
  TransactionRepository,
} from '../../core/contracts/storage';
import { CallbackRejectionReasons } from '../../domain/enums/callback-rejection-reason';
import {
  PaymentRetryLimitExceededError,
  SispError,
  TransactionStateError,
} from '../../domain/errors/exceptions';
import {
  type PaymentRequest,
  paymentRequestToFormFields,
} from '../../domain/value-objects/payment-request';
import type { SignedAction, UrlSigner } from '../../support/signed-url';
import type { SispManager } from '../drivers/sisp-manager';
import type { TransactionRecord } from '../storage/knex/records';
import { renderAutoSubmitForm } from './auto-submit-form';
import { signedCallbackResultUrl } from './callback-processing';
import { buildGatewayFormAction } from './gateway-form-action';
import type { RetryAvailability } from './payment-response';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json, redirect } from './results';
import { parseDecimalAmount } from './validate-payment-input';

export interface LifecycleHandlersDeps {
  config: ResolvedSispConfig;
  manager: SispManager;
  transactions: TransactionRepository;
  attempts: TransactionAttemptRepository;
  cancelTransaction: CancelTransactionAction;
  retryPayment: RetryPaymentAction;
  createRetryAttempt: CreateRetryPaymentAttemptAction;
  canRetryPayment: CanRetryPaymentAction;
  refundTransaction: RefundTransactionAction;
  rateLimits: RateLimitRepository;
  urlSigner: UrlSigner;
}

const RETRY_URL_TTL_MINUTES = 30;
const MAX_REFUND_REASON_LENGTH = 255;

export class LifecycleHandlers {
  constructor(private readonly deps: LifecycleHandlersDeps) {}

  async handleRetryPayment(request: HttpRequestInfo): Promise<HttpResult> {
    const { config, transactions, canRetryPayment, retryPayment, createRetryAttempt, urlSigner } =
      this.deps;

    const signedAction = urlSigner.validateAction(
      `${config.basePath}/retry-payment`,
      request.query,
    );

    if (signedAction === null || (await this.signedActionConsumed(signedAction, 'retry-payment'))) {
      return json({ message: 'Invalid signature.' }, 403);
    }

    const transactionId = Number(request.query.transaction ?? request.body.transaction);
    const transaction = Number.isInteger(transactionId)
      ? await transactions.findById(transactionId)
      : null;

    if (transaction === null) {
      return json({ message: 'Transaction not found.' }, 404);
    }

    const attemptCount = await this.paymentAttemptCount(transaction.id);

    if (transaction.status === 'failed' && canRetryPayment.retryLimitReached(attemptCount)) {
      return json(
        { message: new PaymentRetryLimitExceededError(config.retry.maxAttempts).message },
        409,
      );
    }

    if (!canRetryPayment.handle(transaction, attemptCount)) {
      return json(
        { message: 'This payment cannot be retried because required customer data is missing.' },
        400,
      );
    }

    if (request.method.toUpperCase() === 'GET') {
      return this.renderRetryForm(retryPayment.handle(transaction, false));
    }

    try {
      return this.renderRetryForm(await createRetryAttempt.handle(transaction));
    } catch (error) {
      if (error instanceof PaymentRetryLimitExceededError) {
        return json({ message: error.message }, 409);
      }

      throw error;
    }
  }

  async handleCancel(request: HttpRequestInfo): Promise<HttpResult> {
    const { config, cancelTransaction, urlSigner } = this.deps;

    const signedAction = urlSigner.validateAction(`${config.basePath}/cancel`, request.query);

    if (signedAction === null || (await this.signedActionConsumed(signedAction, 'cancel'))) {
      return json({ message: 'Invalid signature.' }, 403);
    }

    const transaction = await this.resolveCancellable(request.query);

    if (transaction === null) {
      return json({ message: 'Transaction not found.' }, 404);
    }

    const reason =
      typeof request.query.reason === 'string'
        ? request.query.reason
        : CallbackRejectionReasons.UserCancelled;

    try {
      const cancelled = await cancelTransaction.handle(transaction, reason);

      return redirect(signedCallbackResultUrl(config, urlSigner, cancelled.id));
    } catch (error) {
      if (error instanceof TransactionStateError) {
        return json({ message: error.message }, 400);
      }

      throw error;
    }
  }

  async handleRefund(request: HttpRequestInfo, transactionId: number): Promise<HttpResult> {
    const { transactions, refundTransaction } = this.deps;

    if (await this.refundRateLimitExceeded(request)) {
      return json({ success: false, message: 'Too many refund requests. Try again later.' }, 429);
    }

    const transaction = Number.isInteger(transactionId)
      ? await transactions.findById(transactionId)
      : null;

    if (transaction === null) {
      return json({ success: false, message: 'Transaction not found.' }, 404);
    }

    const amount = parseDecimalAmount(request.body.amount ?? 0);

    if (amount === null || amount <= 0) {
      return json({ success: false, message: 'Refund amount must be greater than 0.' }, 400);
    }

    const reason =
      typeof request.body.reason === 'string'
        ? request.body.reason.slice(0, MAX_REFUND_REASON_LENGTH)
        : 'user_refund';

    try {
      const refunded = await refundTransaction.handle(transaction, amount, reason);

      return json({
        success: true,
        message: 'Transaction refunded successfully.',
        transaction: refunded,
      });
    } catch (error) {
      if (error instanceof SispError) {
        return json({ success: false, message: error.message }, 400);
      }

      throw error;
    }
  }

  private async refundRateLimitExceeded(request: HttpRequestInfo): Promise<boolean> {
    return this.ipRateLimitExceeded(request, 'refund', this.deps.config.rateLimiting.perIp);
  }

  async statusRateLimitExceeded(request: HttpRequestInfo): Promise<boolean> {
    return this.ipRateLimitExceeded(
      request,
      'transaction-status',
      this.deps.config.rateLimiting.perIpStatus,
    );
  }

  private async ipRateLimitExceeded(
    request: HttpRequestInfo,
    context: string,
    rule: RateLimitRule,
  ): Promise<boolean> {
    const { config, rateLimits } = this.deps;

    if (!config.rateLimiting.enabled || !rule.enabled || request.ip === '') {
      return false;
    }

    return rateLimits.hit({
      identifier: request.ip,
      limitType: 'ip',
      context,
      limit: rule.limit,
      windowSeconds: rule.windowSeconds,
    });
  }

  async retryAvailability(transaction: TransactionRecord): Promise<RetryAvailability> {
    const attemptCount = await this.paymentAttemptCount(transaction.id);

    if (!this.deps.canRetryPayment.handle(transaction, attemptCount)) {
      return { allowed: false, url: null };
    }

    return { allowed: true, url: this.signedRetryUrl(transaction.id) };
  }

  signedRetryUrl(transactionId: number): string {
    const { config, urlSigner } = this.deps;

    const signedPath = urlSigner.signAction(
      `${config.basePath}/retry-payment`,
      { transaction: transactionId },
      new Date(Date.now() + RETRY_URL_TTL_MINUTES * 60_000),
    );

    return `${config.baseUrl}${signedPath}`;
  }

  private renderRetryForm(paymentRequest: PaymentRequest): HttpResult {
    const fields = paymentRequestToFormFields(paymentRequest);

    return html(
      renderAutoSubmitForm(
        buildGatewayFormAction(this.deps.manager, fields),
        fields,
        'SISP - Redirecting to payment',
      ),
    );
  }

  private async paymentAttemptCount(transactionId: number): Promise<number> {
    const attempts = await this.deps.attempts.listByTransaction(transactionId);

    return Math.max(1, attempts.length);
  }

  private async resolveCancellable(
    query: Record<string, unknown>,
  ): Promise<TransactionRecord | null> {
    const { transactions } = this.deps;
    const merchantRef = query.merchantRef;

    if (typeof merchantRef === 'string' && merchantRef !== '') {
      return transactions.findByRef(merchantRef);
    }

    const transactionId = query.transaction_id;

    if (typeof transactionId === 'string' && transactionId !== '') {
      return transactions.findByGatewayTransactionId(transactionId);
    }

    return null;
  }

  private async signedActionConsumed(action: SignedAction, context: string): Promise<boolean> {
    const windowSeconds = Math.max(1, Math.ceil((action.expiresAt.getTime() - Date.now()) / 1000));

    return this.deps.rateLimits.hit({
      identifier: action.nonce,
      limitType: 'signed-url',
      context,
      limit: 1,
      windowSeconds,
    });
  }
}
