import { describe, expect, it } from 'vitest';
import { isEncrypted, PayloadCipher } from '../../src/infrastructure/storage/knex/encryption';
import { deriveSispKey } from '../../src/support/key-derivation';

const cipher = new PayloadCipher('base64:test-app-key');

describe('PayloadCipher', () => {
  it('encrypts objects at rest and reads them back', () => {
    const payload = { posID: '90051', amount: 1500, nested: { locale: 'pt' } };

    const stored = cipher.store(payload);

    expect(stored).not.toBeNull();
    expect(isEncrypted(stored as string)).toBe(true);
    expect((stored as string).includes('90051')).toBe(false);
    expect(cipher.read(stored)).toEqual(payload);
  });

  it('produces a fresh ciphertext per call but stable plaintext', () => {
    const first = cipher.store({ a: 1 });
    const second = cipher.store({ a: 1 });

    expect(first).not.toBe(second);
    expect(cipher.read(first)).toEqual(cipher.read(second));
  });

  it('keeps already encrypted values untouched', () => {
    const stored = cipher.store({ a: 1 }) as string;

    expect(cipher.store(stored)).toBe(stored);
  });

  it('passes plain strings through on read when they are not encrypted', () => {
    expect(cipher.read('plain text')).toBe('plain text');
    expect(cipher.read('{"a":1}')).toEqual({ a: 1 });
  });

  it('fails closed when decryption fails', () => {
    const tampered = 'sisp.v1:AAAA:BBBB:CCCC';

    expect(() => cipher.read(tampered)).toThrow('Unable to decrypt SISP payload.');
  });

  it('stores null as null', () => {
    expect(cipher.store(null)).toBeNull();
    expect(cipher.store(undefined)).toBeNull();
  });

  it('refuses to store encrypted payloads when no app key is configured', () => {
    const plaintextCipher = new PayloadCipher(null);

    expect(() => plaintextCipher.store({ a: 1 })).toThrow(
      'SISP payload encryption requires an appKey in the configuration.',
    );
    expect(plaintextCipher.read('{"a":1}')).toEqual({ a: 1 });
  });

  it('cannot read payloads encrypted with another key', () => {
    const other = new PayloadCipher('another-key');
    const stored = cipher.store({ secret: true }) as string;

    expect(() => other.read(stored)).toThrow('Unable to decrypt SISP payload.');
  });

  it('derives separate keys for payload encryption and URL signing', () => {
    expect(deriveSispKey('app-key', 'payload-encryption')).not.toEqual(
      deriveSispKey('app-key', 'url-signing'),
    );
  });
});
