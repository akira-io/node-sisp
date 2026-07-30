import { describe, expect, it } from 'vitest';
import { structuredErrorFrom } from '../../src/infrastructure/http/payment-response';

describe('structuredErrorFrom', () => {
  it('returns null without a message type', () => {
    expect(structuredErrorFrom(null, 'pt')).toBeNull();
    expect(structuredErrorFrom('', 'pt')).toBeNull();
  });

  it('returns null for a message type it does not recognise', () => {
    expect(structuredErrorFrom('not-a-type', 'pt')).toBeNull();
  });

  it('builds the structured error for a known type', () => {
    const error = structuredErrorFrom('6', 'en');

    expect(error).not.toBeNull();
    expect(error?.code).toBe('6');
    expect(typeof error?.label).toBe('string');
    expect(typeof error?.category).toBe('string');
    expect(typeof error?.action).toBe('string');
  });
});
