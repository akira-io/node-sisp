import type { CallbackRejectionReason } from '../../domain/enums/callback-rejection-reason';
import type { TransactionStatus } from '../../domain/enums/transaction-status';
import type { TransactionRecord } from '../../domain/records';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';
import type { ExpectedPayment } from './payment-correlation-store';

export interface CallbackOutcome {
  verified: boolean;
  status: TransactionStatus | null;
  reason: CallbackRejectionReason | null;
  payload: CallbackPayload;
}

export interface StoredCallbackOutcome extends CallbackOutcome {
  transaction: TransactionRecord;
  replay: boolean;
}

export interface CallbackVerifier<T extends CallbackOutcome = CallbackOutcome> {
  verify(payload: CallbackPayload, expected?: ExpectedPayment): Promise<T>;
}
