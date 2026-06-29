import { describe, expect, it } from 'vitest';
import {
  generateMerchantReference,
  generateMerchantSession,
  generateTimeStamp,
  MERCHANT_IDENTIFIER_MAX_LENGTH,
} from '../../src/support/generators';

const fixedDate = new Date(2024, 0, 15, 14, 30, 5);

describe('generators', () => {
  it('builds a merchant reference within the SISP 15-character limit', () => {
    const reference = generateMerchantReference(fixedDate);

    expect(reference).toMatch(/^R[0-9a-z]+$/);
    expect(reference.length).toBe(MERCHANT_IDENTIFIER_MAX_LENGTH);
  });

  it('builds a merchant session within the SISP 15-character limit', () => {
    const session = generateMerchantSession(fixedDate);

    expect(session).toMatch(/^S[0-9a-z]+$/);
    expect(session.length).toBe(MERCHANT_IDENTIFIER_MAX_LENGTH);
  });

  it('never exceeds the limit for far-future dates', () => {
    const farFuture = new Date(2058, 11, 31, 23, 59, 59);

    expect(generateMerchantReference(farFuture).length).toBeLessThanOrEqual(
      MERCHANT_IDENTIFIER_MAX_LENGTH,
    );
    expect(generateMerchantSession(farFuture).length).toBeLessThanOrEqual(
      MERCHANT_IDENTIFIER_MAX_LENGTH,
    );
  });

  it('adds entropy for identifiers generated in the same second', () => {
    const references = new Set(
      Array.from({ length: 32 }, () => generateMerchantReference(fixedDate)),
    );
    const sessions = new Set(Array.from({ length: 32 }, () => generateMerchantSession(fixedDate)));

    expect(references.size).toBe(32);
    expect(sessions.size).toBe(32);
  });

  it('formats the SISP timestamp as Y-m-d H:i:s', () => {
    expect(generateTimeStamp(fixedDate)).toBe('2024-01-15 14:30:05');
  });

  it('defaults to the current clock', () => {
    expect(generateMerchantReference()).toMatch(/^R[0-9a-z]+$/);
    expect(generateMerchantSession()).toMatch(/^S[0-9a-z]+$/);
    expect(generateTimeStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
