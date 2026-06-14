import { describe, expect, it } from 'vitest';
import { UrlSigner } from '../../src/support/signed-url';

const signer = new UrlSigner('app-key');

function queryOf(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, 'http://localhost').searchParams);
}

describe('UrlSigner', () => {
  it('signs and validates a URL', () => {
    const url = signer.sign('/sisp/cancel', { merchantRef: 'R1', reason: 'user_cancelled' });

    expect(signer.validate('/sisp/cancel', queryOf(url))).toBe(true);
  });

  it('signs with an expiration that still validates while fresh', () => {
    const url = signer.sign(
      '/sisp/retry-payment',
      { transaction: 7 },
      new Date(Date.now() + 60_000),
    );

    expect(signer.validate('/sisp/retry-payment', queryOf(url))).toBe(true);
  });

  it('rejects expired URLs', () => {
    const url = signer.sign('/sisp/retry-payment', { transaction: 7 }, new Date(Date.now() - 1000));

    expect(signer.validate('/sisp/retry-payment', queryOf(url))).toBe(false);
  });

  it('rejects tampered parameters', () => {
    const url = signer.sign('/sisp/cancel', { merchantRef: 'R1' });
    const tampered = { ...queryOf(url), merchantRef: 'R2' };

    expect(signer.validate('/sisp/cancel', tampered)).toBe(false);
  });

  it('rejects a tampered path', () => {
    const url = signer.sign('/sisp/cancel', { merchantRef: 'R1' });

    expect(signer.validate('/sisp/refund', queryOf(url))).toBe(false);
  });

  it('rejects missing signatures', () => {
    expect(signer.validate('/sisp/cancel', { merchantRef: 'R1' })).toBe(false);
  });

  it('rejects URLs signed with another key', () => {
    const url = new UrlSigner('other-key').sign('/sisp/cancel', { merchantRef: 'R1' });

    expect(signer.validate('/sisp/cancel', queryOf(url))).toBe(false);
  });

  it('requires an appKey to sign', () => {
    expect(() => new UrlSigner(null).sign('/sisp/cancel', {})).toThrow(
      'Signed SISP URLs require an appKey in the configuration.',
    );
  });
});
