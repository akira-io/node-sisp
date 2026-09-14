import { createCipheriv, randomBytes } from 'node:crypto';
import { deriveSispKey } from '../../src/support/key-derivation';

export function legacyV1Envelope(appKey: string, value: unknown): string {
  const key = deriveSispKey(appKey, 'payload-encryption');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  cipher.setAAD(Buffer.from('sisp.v1', 'utf8'));

  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);

  return [
    'sisp.v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}
