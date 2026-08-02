import type { CallbackRejectionReason } from '../../domain/enums/callback-rejection-reason';
import type { TransactionRecord } from '../../domain/records';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';

export interface CallbackOutcome {
  verified: boolean;
  reason: CallbackRejectionReason | null;
  payload: CallbackPayload;
}

export interface StoredCallbackOutcome extends CallbackOutcome {
  transaction: TransactionRecord;
  replay: boolean;
}

export interface CallbackVerifier<T extends CallbackOutcome = CallbackOutcome> {
  verify(payload: CallbackPayload): Promise<T>;
}
