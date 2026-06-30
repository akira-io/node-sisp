import type { CanRetryPaymentAction } from '../../application/actions/can-retry-payment';
import type { CreateRetryPaymentAttemptAction } from '../../application/actions/create-retry-payment-attempt';
import type { ResolvedSispConfig } from '../../application/config';
import { PaymentContext } from '../../application/pipelines/payment/payment-context';
import type { ProcessPaymentPipeline } from '../../application/pipelines/payment/process-payment-pipeline';
import type {
  PaymentIntentRepository,
  TransactionAttemptRepository,
  TransactionRepository,
} from '../../core/contracts/storage';
import { TransactionStatus } from '../../domain/enums/transaction-status';
import { PaymentIntentAlreadyProcessingError } from '../../domain/errors/exceptions';
import type { PaymentRequest } from '../../domain/value-objects/payment-request';
import { paymentRequestDataFrom } from '../../domain/value-objects/payment-request-data';
import {
  type TransactionAttemptRecord,
  type TransactionRecord,
  transactionPayloadRecord,
} from '../storage/knex/records';
import type { HttpRequestInfo } from './request-info';

export interface PaymentContextResolverDeps {
  config: ResolvedSispConfig;
  paymentPipeline: ProcessPaymentPipeline;
  transactions: TransactionRepository;
  attempts: TransactionAttemptRepository;
  paymentIntents: PaymentIntentRepository;
  createRetryAttempt: CreateRetryPaymentAttemptAction;
  canRetryPayment: CanRetryPaymentAction;
}

export class PaymentContextResolver {
  constructor(private readonly deps: PaymentContextResolverDeps) {}

  async resolve(request: HttpRequestInfo): Promise<PaymentContext> {
    const context = this.emptyPaymentContext(request);

    await this.deps.paymentPipeline.runPreflight(context);

    const idempotencyKey = this.idempotencyKey(request.body);

    if (idempotencyKey === null) {
      return this.newPaymentContext(context);
    }

    if (!(await this.deps.paymentIntents.reserve(idempotencyKey))) {
      return this.existingPaymentContext(context, idempotencyKey);
    }

    try {
      await this.deps.paymentPipeline.run(context);
      await this.deps.paymentIntents.submit(idempotencyKey, context.requireTransaction().id);

      return context;
    } catch (error) {
      await this.deps.paymentIntents.fail(
        idempotencyKey,
        errorMessage(error),
        context.transaction?.id ?? null,
      );

      throw error;
    }
  }

  private async newPaymentContext(context: PaymentContext): Promise<PaymentContext> {
    return this.deps.paymentPipeline.run(context);
  }

  private emptyPaymentContext(request: HttpRequestInfo): PaymentContext {
    return new PaymentContext(paymentRequestDataFrom(request.body), request);
  }

  private async existingPaymentContext(
    context: PaymentContext,
    idempotencyKey: string,
  ): Promise<PaymentContext> {
    const intent = await this.deps.paymentIntents.findByKey(idempotencyKey);

    if (intent?.transaction_id == null) {
      throw new PaymentIntentAlreadyProcessingError(idempotencyKey);
    }

    const transaction = await this.deps.transactions.findById(intent.transaction_id);

    if (transaction === null) {
      throw new PaymentIntentAlreadyProcessingError(idempotencyKey);
    }

    context.transaction = transaction;
    const attempts = await this.deps.attempts.listByTransaction(transaction.id);
    const attemptCount = Math.max(1, attempts.length);

    if (transaction.status === TransactionStatus.Failed) {
      this.deps.canRetryPayment.ensureRetryLimit(attemptCount);
    }

    if (this.deps.canRetryPayment.handle(transaction, attemptCount)) {
      context.paymentRequest = await this.deps.createRetryAttempt.handle(transaction);
      context.transaction = (await this.deps.transactions.findById(transaction.id)) ?? transaction;
      await this.deps.paymentIntents.submit(idempotencyKey, transaction.id);

      return context;
    }

    context.paymentRequest = await this.paymentRequestFrom(transaction, idempotencyKey, attempts);
    await this.deps.paymentIntents.submit(idempotencyKey, transaction.id);

    return context;
  }

  private idempotencyKey(body: Record<string, unknown>): string | null {
    if (!this.deps.config.idempotency.enabled) {
      return null;
    }

    for (const key of this.deps.config.idempotency.requestKeys) {
      const requestValue = body[key];

      if (typeof requestValue === 'string' && requestValue.trim() !== '') {
        return requestValue.trim();
      }
    }

    return null;
  }

  private async paymentRequestFrom(
    transaction: TransactionRecord,
    idempotencyKey: string,
    attempts: readonly TransactionAttemptRecord[],
  ): Promise<PaymentRequest> {
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
