import type { Knex } from 'knex';
import type { CanRetryPaymentAction } from '../actions/can-retry-payment';
import type { CancelTransactionAction } from '../actions/cancel-transaction';
import type { CreateRetryPaymentAttemptAction } from '../actions/create-retry-payment-attempt';
import type { RefundTransactionAction } from '../actions/refund-transaction';
import type { RetryPaymentAction } from '../actions/retry-payment';
import type { ResolvedSispConfig } from '../config';
import type { RateLimit } from '../database/models/rate-limit';
import type { Transaction } from '../database/models/transaction';
import type { TransactionAttempt } from '../database/models/transaction-attempt';
import type { TransactionRecord } from '../database/records';
import type { SispManager } from '../drivers/sisp-manager';
import { SispError, TransactionStateError } from '../exceptions';
import type { UrlSigner } from '../support/signed-url';
import { type PaymentRequest, paymentRequestToFormFields } from '../value-objects/payment-request';
import { renderAutoSubmitForm } from './auto-submit-form';
import { signedCallbackResultUrl } from './callback-processing';
import { buildGatewayFormAction } from './gateway-form-action';
import type { RetryAvailability } from './payment-response';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json, redirect } from './results';

export interface LifecycleHandlersDeps {
  config: ResolvedSispConfig;
  db: Knex;
  manager: SispManager;
  transactions: Transaction;
  attempts: TransactionAttempt;
  cancelTransaction: CancelTransactionAction;
  retryPayment: RetryPaymentAction;
  createRetryAttempt: CreateRetryPaymentAttemptAction;
  canRetryPayment: CanRetryPaymentAction;
  refundTransaction: RefundTransactionAction;
  rateLimits: RateLimit;
  urlSigner: UrlSigner;
}

const RETRY_URL_TTL_MINUTES = 30;

export class LifecycleHandlers {
  constructor(private readonly deps: LifecycleHandlersDeps) {}

  async handleRetryPayment(request: HttpRequestInfo): Promise<HttpResult> {
    const { config, transactions, canRetryPayment, retryPayment, createRetryAttempt, urlSigner } =
      this.deps;

    if (!urlSigner.validate(`${config.basePath}/retry-payment`, request.query)) {
      return json({ message: 'Invalid signature.' }, 403);
    }

    const transactionId = Number(request.query.transaction ?? request.body.transaction);
    const transaction = Number.isInteger(transactionId)
      ? await transactions.findById(transactionId)
      : null;

    if (transaction === null) {
      return json({ message: 'Transaction not found.' }, 404);
    }

    if (!canRetryPayment.handle(transaction)) {
      return json(
        { message: 'This payment cannot be retried because required customer data is missing.' },
        400,
      );
    }

    if (request.method.toUpperCase() === 'GET') {
      return this.renderRetryForm(retryPayment.handle(transaction, false));
    }

    return this.renderRetryForm(await createRetryAttempt.handle(transaction));
  }

  async handleCancel(request: HttpRequestInfo): Promise<HttpResult> {
    const { config, cancelTransaction, urlSigner } = this.deps;

    if (!urlSigner.validate(`${config.basePath}/cancel`, request.query)) {
      return json({ message: 'Invalid signature.' }, 403);
    }

    const transaction = await this.resolveCancellable(request.query);

    if (transaction === null) {
      return json({ message: 'Transaction not found.' }, 404);
    }

    const reason =
      typeof request.query.reason === 'string' ? request.query.reason : 'user_cancelled';

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

    const amount = Number(request.body.amount ?? 0);

    if (!Number.isFinite(amount)) {
      return json({ success: false, message: 'Refund amount must be greater than 0.' }, 400);
    }

    const reason = typeof request.body.reason === 'string' ? request.body.reason : 'user_refund';

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
    const { config, rateLimits } = this.deps;
    const { enabled, perIp } = config.rateLimiting;

    if (!enabled || !perIp.enabled) {
      return false;
    }

    return rateLimits.hit({
      identifier: request.ip,
      limitType: 'ip',
      context: 'refund',
      limit: perIp.limit,
      windowSeconds: perIp.windowSeconds,
    });
  }

  retryAvailability(transaction: TransactionRecord): RetryAvailability {
    if (!this.deps.canRetryPayment.handle(transaction)) {
      return { allowed: false, url: null };
    }

    return { allowed: true, url: this.signedRetryUrl(transaction.id) };
  }

  signedRetryUrl(transactionId: number): string {
    const { config, urlSigner } = this.deps;

    const signedPath = urlSigner.sign(
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
}
