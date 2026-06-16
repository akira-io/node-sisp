import type { Transaction } from '../database/models/transaction';
import type { TransactionAttempt } from '../database/models/transaction-attempt';

export async function isAlreadyProcessed(
  transactions: Transaction,
  attempts: TransactionAttempt,
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
