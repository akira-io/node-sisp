import type { CancelTransactionAction } from '../../application/actions/cancel-transaction';
import type { ResolvedSispConfig } from '../../application/config';
import type {
  TransactionAttemptRepository,
  TransactionRepository,
} from '../../core/contracts/storage';
import { CallbackRejectionReasons } from '../../domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../../domain/enums/transaction-status';
import {
  type CallbackPayload,
  callbackPayloadFrom,
} from '../../domain/value-objects/callback-payload';
import type { UrlSigner } from '../../support/signed-url';
import type { HttpRequestInfo } from './request-info';

const RESULT_URL_TTL_MINUTES = 30;

export function signedCallbackResultUrl(
  config: ResolvedSispConfig,
  urlSigner: UrlSigner,
  transactionId: number,
): string {
  const signedPath = urlSigner.sign(
    `${config.basePath}/callback`,
    { transaction: transactionId },
    new Date(Date.now() + RESULT_URL_TTL_MINUTES * 60_000),
  );

  return `${config.baseUrl}${signedPath}`;
}

export function frontendResultUrl(baseUrl: string, merchantRef: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?';

  return `${baseUrl}${separator}ref=${encodeURIComponent(merchantRef)}`;
}

export async function isAlreadyProcessed(
  transactions: TransactionRepository,
  attempts: TransactionAttemptRepository,
  payload: Pick<
    CallbackPayload,
    'merchantRef' | 'merchantSession' | 'transactionID' | 'messageType'
  >,
): Promise<boolean> {
  const gatewayTransactionId = String(payload.transactionID);
  const attempt = await attempts.findByRefAndSession(payload.merchantRef, payload.merchantSession);

  if (attempt !== null) {
    return (
      attempt.status === TransactionStatus.Completed ||
      (attempt.gateway_transaction_id !== null &&
        attempt.gateway_transaction_id === gatewayTransactionId &&
        attempt.message_type === payload.messageType)
    );
  }

  const transaction = await transactions.findByRefAndSession(
    payload.merchantRef,
    payload.merchantSession,
  );

  if (transaction === null) {
    return false;
  }

  return (
    transaction.status === TransactionStatus.Completed ||
    (transaction.transaction_id !== null &&
      transaction.transaction_id === gatewayTransactionId &&
      transaction.message_type === payload.messageType)
  );
}

export function booleanFromInput(value: unknown): boolean {
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

export function isUserCancelled(request: HttpRequestInfo): boolean {
  return (
    booleanFromInput(request.body.userCancelled ?? request.query.userCancelled) ||
    booleanFromInput(request.body.UserCancelled ?? request.query.UserCancelled)
  );
}

export async function cancelUserCancelledTransaction(
  transactions: TransactionRepository,
  cancelTransaction: CancelTransactionAction,
  request: HttpRequestInfo,
): Promise<boolean> {
  const merchantRef = textFromInput(request.body.merchantRef ?? request.query.merchantRef);
  const merchantSession = textFromInput(
    request.body.merchantSession ?? request.query.merchantSession,
  );

  if (!merchantRef || !merchantSession) {
    return false;
  }

  const transaction = await transactions.findByRefAndSession(merchantRef, merchantSession);

  if (!transaction) {
    return false;
  }

  await cancelTransaction.handle(transaction, CallbackRejectionReasons.UserCancelled);

  return true;
}

export function textFromInput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '';
}

export function cancellationPayloadFrom(request: HttpRequestInfo): CallbackPayload {
  const input = { ...request.query, ...request.body };

  return callbackPayloadFrom({
    merchantRespMerchantRef: input.merchantRef,
    merchantRespMerchantSession: input.merchantSession,
    ...input,
  });
}
