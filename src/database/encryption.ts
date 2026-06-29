import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deriveSispKey } from '../support/key-derivation';

const PREFIX = 'sisp.v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AAD = Buffer.from(PREFIX, 'utf8');
const MISSING_KEY_MESSAGE = 'SISP payload encryption requires an appKey in the configuration.';

export class PayloadCipher {
  private readonly key: Buffer | null;

  constructor(appKey: string | null) {
    this.key =
      appKey === null || appKey === '' ? null : deriveSispKey(appKey, 'payload-encryption');
  }

  store(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (isEncrypted(serialized)) {
      return serialized;
    }

    if (this.key === null) {
      throw new Error(MISSING_KEY_MESSAGE);
    }

    return this.encrypt(serialized, this.key);
  }

  read(stored: unknown): unknown {
    if (typeof stored !== 'string') {
      return stored;
    }

    if (!isEncrypted(stored)) {
      return parseJson(stored);
    }

    if (this.key === null) {
      throw new Error(MISSING_KEY_MESSAGE);
    }

    return parseJson(this.decrypt(stored, this.key));
  }

  private encrypt(plain: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(AAD);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      PREFIX,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private decrypt(stored: string, key: Buffer): string {
    const [, iv, tag, encrypted] = stored.split(':');

    if (!iv || !tag || !encrypted) {
      throw new Error('Unable to decrypt SISP payload.');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
      decipher.setAAD(AAD);
      decipher.setAuthTag(Buffer.from(tag, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Unable to decrypt SISP payload.');
    }
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
