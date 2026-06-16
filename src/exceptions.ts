export class SispError extends Error {}

export class BlacklistedIdentifierError extends SispError {}

export class RateLimitExceededError extends SispError {}

export class TransactionNotFoundError extends SispError {}

export class TransactionStateError extends SispError {}

export class DuplicatePaymentIdentifierError extends SispError {}

export class PaymentIntentAlreadyProcessingError extends SispError {
  constructor(readonly idempotencyKey: string) {
    super('Payment is already being processed.');
  }
}

export class UnableToGenerateUniquePaymentIdentifiersError extends SispError {
  constructor(readonly attempts: number) {
    super(`Unable to generate unique SISP payment identifiers after ${attempts} attempts.`);
  }
}

export class MissingThreeDSecureDataError extends SispError {
  constructor(readonly missingFields: readonly string[]) {
    super(
      `3-D Secure payments require customer data. Missing fields: ${missingFields.join(', ')}.`,
    );
  }
}
