import { describe, expect, it } from 'vitest';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { generatePaymentFingerprint } from '../../src/infrastructure/fingerprints/payment-fingerprint';
import { generateRefundFingerprint } from '../../src/infrastructure/fingerprints/refund-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import { toCents, toThousandths } from '../../src/support/sisp-amount';
import vectors from '../fixtures/golden-vectors.json';

const invalidLegacyAmountValues = new Set(['', 'abc', '12abc', '1e3']);
const validAmountVectors = vectors.amounts.filter(
  ({ kind, value }) => kind !== 'string' || !invalidLegacyAmountValues.has(String(value)),
);
const invalidAmountVectors = vectors.amounts.filter(
  ({ kind, value }) => kind === 'string' && invalidLegacyAmountValues.has(String(value)),
);

describe('golden vectors generated from akira-io/laravel-sisp@2.x', () => {
  it.each(vectors.tokens)('token for posAutCode $posAutCode', ({ posAutCode, token }) => {
    expect(computeToken(posAutCode)).toBe(token);
  });

  it.each(validAmountVectors)('amount $value ($kind) to thousandths and cents', ({
    value,
    thousandths,
    cents,
  }) => {
    expect(toThousandths(value)).toBe(thousandths);
    expect(toCents(value)).toBe(cents);
  });

  it.each(invalidAmountVectors)('rejects invalid legacy amount $value', ({ value }) => {
    expect(() => toThousandths(value)).toThrow(
      'Invalid SISP amount. Use a dot as the decimal separator.',
    );
    expect(() => toCents(value)).toThrow(
      'Invalid SISP amount. Use a dot as the decimal separator.',
    );
  });

  it.each(vectors.payment)('payment request fingerprint for $data.merchantRef', ({
    posAutCode,
    data,
    fingerprint,
  }) => {
    expect(generatePaymentFingerprint(computeToken(posAutCode), data)).toBe(fingerprint);
  });

  it.each(vectors.callback)('callback fingerprint for messageType $post.messageType', ({
    posAutCode,
    post,
    fingerprint,
  }) => {
    const payload = callbackPayloadFrom(post);

    expect(generateCallbackFingerprint(computeToken(posAutCode), payload)).toBe(fingerprint);
  });

  it.each(vectors.refund)('refund fingerprint for transactionCode $data.transactionCode', ({
    posAutCode,
    data,
    fingerprint,
  }) => {
    expect(generateRefundFingerprint(computeToken(posAutCode), data)).toBe(fingerprint);
  });
});
