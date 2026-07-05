import { describe, expect, it } from 'vitest';
import { constantTimeEquals } from '../../../src/infrastructure/fingerprints/hash';

describe('constantTimeEquals', () => {
  it('compares equal values', () => {
    expect(constantTimeEquals('fingerprint', 'fingerprint')).toBe(true);
  });

  it('rejects different values with different lengths', () => {
    expect(constantTimeEquals('fingerprint', 'fingerprint-with-suffix')).toBe(false);
  });
});
