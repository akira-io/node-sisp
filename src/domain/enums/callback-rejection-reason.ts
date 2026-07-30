export const CallbackRejectionReasons = {
  InvalidFingerprint: 'invalid_callback_fingerprint',
  DetailsMismatch: 'callback_details_mismatch',
  Replayed: 'callback_replayed',
  UnknownTransaction: 'unknown_transaction',
  UserCancelled: 'user_cancelled',
} as const;

export type CallbackRejectionReason =
  (typeof CallbackRejectionReasons)[keyof typeof CallbackRejectionReasons];

const ALL: readonly string[] = Object.values(CallbackRejectionReasons);

export function isCallbackRejectionReason(value: unknown): value is CallbackRejectionReason {
  return typeof value === 'string' && ALL.includes(value);
}
