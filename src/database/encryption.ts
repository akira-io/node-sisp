import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'sisp.v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export class PayloadCipher {
  private readonly key: Buffer | null;

  constructor(appKey: string | null) {
    this.key = appKey === null || appKey === '' ? null : sha256(appKey);
  }

  store(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (this.key === null || isEncrypted(serialized)) {
      return serialized;
    }

    return this.encrypt(serialized, this.key);
  }

  read(stored: unknown): unknown {
    if (typeof stored !== 'string') {
      return stored;
    }

    const plain = this.key !== null && isEncrypted(stored) ? this.decrypt(stored, this.key) : stored;

    if (plain === null) {
      return stored;
    }

    return parseJson(plain);
  }

  private encrypt(plain: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(
      ':',
    );
  }

  private decrypt(stored: string, key: Buffer): string | null {
    const [, iv, tag, encrypted] = stored.split(':');

    if (!iv || !tag || !encrypted) {
      return null;
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
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

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
