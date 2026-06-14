export class SispError extends Error {}

export class BlacklistedIdentifierError extends SispError {}

export class RateLimitExceededError extends SispError {}

export class TransactionNotFoundError extends SispError {}

export class TransactionStateError extends SispError {}

export class MissingThreeDSecureDataError extends SispError {
  constructor(readonly missingFields: readonly string[]) {
    super(
      `3-D Secure payments require customer data. Missing fields: ${missingFields.join(', ')}.`,
    );
  }
}
