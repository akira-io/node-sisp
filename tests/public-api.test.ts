import { describe, expect, it } from 'vitest';
import * as api from '../src';
import {
  DuplicatePaymentIdentifierError,
  PaymentRetryLimitExceededError,
  SispError,
  TransactionStateError,
  TransactionStatusTransportError,
  UnableToGenerateUniquePaymentIdentifiersError,
} from '../src';

describe('public API', () => {
  it('exports public SISP error subclasses for instanceof narrowing', () => {
    const errors = [
      new DuplicatePaymentIdentifierError('duplicate'),
      new PaymentRetryLimitExceededError(3),
      new TransactionStateError('invalid state'),
      new TransactionStatusTransportError('gateway unavailable'),
      new UnableToGenerateUniquePaymentIdentifiersError(3),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(SispError);
    }
  });

  it('keeps PayloadCipher out of the package root API', () => {
    expect('PayloadCipher' in api).toBe(false);
  });
});
