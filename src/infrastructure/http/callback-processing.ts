import type { CancelTransactionAction } from '../../application/actions/cancel-transaction';
import type { ResolvedSispConfig } from '../../application/config';
import type {
  TransactionAttemptRepository,
  TransactionRepository,
} from '../../core/contracts/storage';
import type { UrlSigner } from '../../support/signed-url';
import type { HttpRequestInfo } from './request-info';

export function signedCallbackResultUrl(
  config: ResolvedSispConfig,
  urlSigner: UrlSigner,
  transactionId: number,
): string {
  const signedPath = urlSigner.sign(`${config.basePath}/callback`, { transaction: transactionId });

  return `${config.baseUrl}${signedPath}`;
}

export function frontendResultUrl(baseUrl: string, merchantRef: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?';

  return `${baseUrl}${separator}ref=${encodeURIComponent(merchantRef)}`;
}

export async function isAlreadyProcessed(
  transactions: TransactionRepository,
  attempts: TransactionAttemptRepository,
  merchantRef: string,
  merchantSession: string,
): Promise<boolean> {
  const attempt = await attempts.findByRefAndSession(merchantRef, merchantSession);

  if (attempt !== null) {
    return attempt.gateway_transaction_id !== null;
  }

  const transaction = await transactions.findByRefAndSession(merchantRef, merchantSession);

  return transaction !== null && transaction.transaction_id !== null;
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

export async function cancelUserCancelledTransaction(
  transactions: TransactionRepository,
  cancelTransaction: CancelTransactionAction,
  request: HttpRequestInfo,
): Promise<void> {
  const merchantRef = textFromInput(request.body.merchantRef ?? request.query.merchantRef);
  const merchantSession = textFromInput(
    request.body.merchantSession ?? request.query.merchantSession,
  );

  if (!merchantRef || !merchantSession) {
    return;
  }

  const transaction = await transactions.findByRefAndSession(merchantRef, merchantSession);

  if (!transaction) {
    return;
  }

  await cancelTransaction.handle(transaction, 'user_cancelled');
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
