import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isEncrypted, PayloadCipher } from '../../src/infrastructure/storage/knex/encryption';
import { deriveSispKey } from '../../src/support/key-derivation';

function legacyV1Envelope(value: unknown): string {
  const key = deriveSispKey('rotation-key', 'payload-encryption');
  const iv = randomBytes(12);
  const encipher = createCipheriv('aes-256-gcm', key, iv);

  encipher.setAAD(Buffer.from('sisp.v1', 'utf8'));

  const encrypted = Buffer.concat([
    encipher.update(JSON.stringify(value), 'utf8'),
    encipher.final(),
  ]);

  return [
    'sisp.v1',
    iv.toString('base64'),
    encipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

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

  it('rejects truncated authentication tags and short IVs', () => {
    const stored = cipher.store({ secret: true }) as string;
    const [prefix, iv, tag, encrypted] = stored.split(':') as [string, string, string, string];
    const shortTag = Buffer.from(tag, 'base64').subarray(0, 8).toString('base64');
    const shortIv = Buffer.from(iv, 'base64').subarray(0, 8).toString('base64');

    expect(() => cipher.read([prefix, iv, shortTag, encrypted].join(':'))).toThrow(
      'Unable to decrypt SISP payload.',
    );
    expect(() => cipher.read([prefix, shortIv, tag, encrypted].join(':'))).toThrow(
      'Unable to decrypt SISP payload.',
    );
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

  it('rejects a key id that no configured key matches', () => {
    const other = new PayloadCipher('another-key');
    const stored = cipher.store({ secret: true }) as string;
    const kid = stored.split(':')[1];

    expect(() => other.read(stored)).toThrow(
      `Unable to decrypt SISP payload: no configured key matches the key id ${kid}. Add the key that wrote it to previousAppKeys.`,
    );
  });

  it('derives separate keys for payload encryption and URL signing', () => {
    expect(deriveSispKey('app-key', 'payload-encryption')).not.toEqual(
      deriveSispKey('app-key', 'url-signing'),
    );
  });
});

describe('PayloadCipher key rotation', () => {
  it('writes the v2 envelope carrying a key id', () => {
    const cipher = new PayloadCipher('rotation-key');
    const stored = cipher.store({ a: 1 }) as string;

    expect(stored.startsWith('sisp.v2:')).toBe(true);
    expect(stored.split(':')).toHaveLength(5);
  });

  it('still reads a v1 value written by the current key', () => {
    const v1 = legacyV1Envelope({ a: 1 });

    expect(new PayloadCipher('rotation-key').read(v1)).toEqual({ a: 1 });
  });

  it('reads a value written by a previous key', () => {
    const old = new PayloadCipher('old-key');
    const stored = old.store({ a: 1 });

    const rotated = new PayloadCipher({ current: 'new-key', previous: ['old-key'] });

    expect(rotated.read(stored)).toEqual({ a: 1 });
  });

  it('names the key id it cannot find', () => {
    const stored = new PayloadCipher('old-key').store({ a: 1 }) as string;
    const kid = stored.split(':')[1];

    expect(() => new PayloadCipher('new-key').read(stored)).toThrow(kid as string);
  });

  it('reports whether a value is already on the current key', () => {
    const rotated = new PayloadCipher({ current: 'new-key', previous: ['old-key'] });
    const onOld = new PayloadCipher('old-key').store({ a: 1 });
    const onNew = rotated.store({ a: 1 });

    expect(rotated.isCurrentKey(onOld)).toBe(false);
    expect(rotated.isCurrentKey(onNew)).toBe(true);
  });

  it('rekeys a value written by a previous key', () => {
    const onOld = new PayloadCipher('old-key').store({ a: 1 }) as string;
    const rotated = new PayloadCipher({ current: 'new-key', previous: ['old-key'] });

    const rekeyed = rotated.rekey(onOld);

    expect(rotated.isCurrentKey(rekeyed)).toBe(true);
    expect(new PayloadCipher('new-key').read(rekeyed)).toEqual({ a: 1 });
  });

  it('rekeys a value that is already on the current key', () => {
    const rotated = new PayloadCipher('new-key');
    const stored = rotated.store({ a: 1 }) as string;

    const rekeyed = rotated.rekey(stored);

    expect(rotated.isCurrentKey(rekeyed)).toBe(true);
    expect(rotated.read(rekeyed)).toEqual({ a: 1 });
  });

  it('binds the key id into the AAD', () => {
    const key = deriveSispKey('rotation-key', 'payload-encryption');
    const kid = deriveSispKey('rotation-key', 'payload-key-id').toString('base64url').slice(0, 8);
    const iv = randomBytes(12);
    const forgeCipher = createCipheriv('aes-256-gcm', key, iv);

    forgeCipher.setAAD(Buffer.from('sisp.v2', 'utf8'));

    const encrypted = Buffer.concat([forgeCipher.update('{"a":1}', 'utf8'), forgeCipher.final()]);
    const forged = [
      'sisp.v2',
      kid,
      iv.toString('base64'),
      forgeCipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');

    expect(() => new PayloadCipher('rotation-key').read(forged)).toThrow(
      'Unable to decrypt SISP payload.',
    );
  });

  it('rejects a rotation whose keys collide on the same key id', () => {
    expect(
      () => new PayloadCipher({ current: 'rotation-key', previous: ['rotation-key'] }),
    ).toThrow('SISP payload encryption key id collision');
  });
});
