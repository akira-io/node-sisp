import { describe, expect, it } from 'vitest';
import {
  CallbackRejectionReasons,
  isCallbackRejectionReason,
} from '../../src/domain/enums/callback-rejection-reason';

describe('CallbackRejectionReasons', () => {
  it('keeps the wire values already used by the callback pipeline', () => {
    expect(CallbackRejectionReasons.InvalidFingerprint).toBe('invalid_callback_fingerprint');
    expect(CallbackRejectionReasons.DetailsMismatch).toBe('callback_details_mismatch');
    expect(CallbackRejectionReasons.UserCancelled).toBe('user_cancelled');
  });

  it('adds the stateless reasons', () => {
    expect(CallbackRejectionReasons.Replayed).toBe('callback_replayed');
    expect(CallbackRejectionReasons.UnknownTransaction).toBe('unknown_transaction');
  });

  it('narrows arbitrary strings', () => {
    expect(isCallbackRejectionReason('callback_replayed')).toBe(true);
    expect(isCallbackRejectionReason('something_else')).toBe(false);
  });
});
