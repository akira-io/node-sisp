import type { CallbackPipe } from '../../../../core/contracts/pipes';
import type { SispStorage } from '../../../../core/contracts/storage';
import { TransactionStatus } from '../../../../domain/enums/transaction-status';
import { TransactionNotFoundError } from '../../../../domain/errors/exceptions';
import type { CallbackPayload } from '../../../../domain/value-objects/callback-payload';
import { runWithLogSource } from '../../../../infrastructure/storage/knex/log-context';
import {
  attemptChangesFromCallback,
  shouldPropagateAttemptToTransaction,
} from '../../../../infrastructure/storage/knex/models/transaction-attempt';
import type { TransactionAttemptRecord } from '../../../../infrastructure/storage/knex/records';
import { mapTransactionStatus } from '../../../actions/map-transaction-status';
import type { CallbackContext } from '../callback-context';

export class ApplyTransactionStatus implements CallbackPipe {
  constructor(private readonly storage: SispStorage) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const payload = context.payload;
    const status = mapTransactionStatus(payload.messageType);

    const result = await this.storage.transaction(async (tx) => {
      const lockedAttempt = await tx.transactionAttempts.findByRefAndSessionForUpdate(
        payload.merchantRef,
        payload.merchantSession,
      );

      if (lockedAttempt === null) {
        return {
          attempt: context.requireAttempt(),
          transaction: context.requireTransaction(),
          propagated: false,
        };
      }

      const lockedTransaction = await tx.transactions.findByIdForUpdate(
        lockedAttempt.transaction_id,
      );

      if (lockedTransaction === null) {
        throw new TransactionNotFoundError(
          `No transaction found for merchantRef ${payload.merchantRef}.`,
        );
      }

      if (isReplayCallback(lockedAttempt, payload, status)) {
        return { attempt: lockedAttempt, transaction: lockedTransaction, propagated: false };
      }

      const updatedAttempt = await tx.transactionAttempts.update(
        lockedAttempt.id,
        attemptChangesFromCallback(payload, status),
      );

      if (!shouldPropagateAttemptToTransaction(updatedAttempt, status)) {
        return { attempt: updatedAttempt, transaction: lockedTransaction, propagated: false };
      }

      const updatedTransaction = await runWithLogSource('callback', () =>
        tx.transactions.update(lockedTransaction.id, {
          merchant_session: updatedAttempt.merchant_session,
          transaction_id: String(payload.transactionID),
          message_type: payload.messageType,
          merchant_response: payload.merchantResponse,
          response_code: payload.merchantRespCp,
          fingerprint: payload.fingerprint,
          status,
        }),
      );

      return { attempt: updatedAttempt, transaction: updatedTransaction, propagated: true };
    });

    context.attempt = result.attempt;
    context.transaction = result.transaction;
    context.transactionStatusPropagated = result.propagated;

    if (!result.propagated) {
      await next();

      return;
    }

    await next();
  }
}

function isReplayCallback(
  attempt: TransactionAttemptRecord,
  payload: CallbackPayload,
  status: TransactionStatus,
): boolean {
  if (attempt.gateway_transaction_id === null) {
    return false;
  }

  if (attempt.status === TransactionStatus.Completed) {
    return true;
  }

  return attempt.status === status || sameGatewayCallback(attempt, payload);
}

function sameGatewayCallback(attempt: TransactionAttemptRecord, payload: CallbackPayload): boolean {
  return (
    attempt.gateway_transaction_id === String(payload.transactionID) &&
    attempt.message_type === payload.messageType
  );
}
