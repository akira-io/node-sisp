import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deriveSispKey } from '../../../support/key-derivation';

const V1_PREFIX = 'sisp.v1';
const V2_PREFIX = 'sisp.v2';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const V1_AAD = Buffer.from(V1_PREFIX, 'utf8');
const MISSING_KEY_MESSAGE = 'SISP payload encryption requires an appKey in the configuration.';
const UNREADABLE_MESSAGE = 'Unable to decrypt SISP payload.';
const KEY_ID_MAX_LENGTH = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export interface PayloadCipherKeys {
  current: string | null;
  previous?: readonly string[];
}

interface DerivedKey {
  id: string;
  key: Buffer;
}

function keyId(appKey: string): string {
  return deriveSispKey(appKey, 'payload-key-id').toString('base64url').slice(0, 8);
}

function derive(appKey: string): DerivedKey {
  return { id: keyId(appKey), key: deriveSispKey(appKey, 'payload-encryption') };
}

function normalizeKeys(keys: string | null | PayloadCipherKeys): PayloadCipherKeys {
  return typeof keys === 'string' || keys === null ? { current: keys } : keys;
}

export class PayloadCipher {
  private readonly current: DerivedKey | null;
  private readonly byId: Map<string, Buffer>;
  private readonly all: readonly DerivedKey[];

  constructor(keys: string | null | PayloadCipherKeys) {
    const { current, previous = [] } = normalizeKeys(keys);

    this.current = current === null || current === '' ? null : derive(current);

    const others = previous.filter((key) => key !== '').map(derive);

    this.all = this.current === null ? others : [this.current, ...others];

    const seen = new Set<string>();

    for (const { id } of this.all) {
      if (seen.has(id)) {
        throw new Error(
          `SISP payload encryption key id collision: two configured keys share the key id ${id}.`,
        );
      }

      seen.add(id);
    }

    this.byId = new Map(this.all.map(({ id, key }) => [id, key]));
  }

  store(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (isEncryptedEnvelope(serialized)) {
      return serialized;
    }

    if (this.current === null) {
      throw new Error(MISSING_KEY_MESSAGE);
    }

    return this.encrypt(serialized, this.current);
  }

  read(stored: unknown): unknown {
    if (typeof stored !== 'string') {
      return stored;
    }

    if (!looksLikeEnvelope(stored)) {
      return parseJson(stored);
    }

    if (this.all.length === 0) {
      throw new Error(MISSING_KEY_MESSAGE);
    }

    return parseJson(
      stored.startsWith(`${V2_PREFIX}:`) ? this.decryptV2(stored) : this.decryptV1(stored),
    );
  }

  isCurrentKey(stored: unknown): boolean {
    if (typeof stored !== 'string' || !stored.startsWith(`${V2_PREFIX}:`)) {
      return false;
    }

    return stored.split(':')[1] === this.current?.id;
  }

  rekey(stored: string): string {
    if (this.current === null) {
      throw new Error(MISSING_KEY_MESSAGE);
    }

    const plain = stored.startsWith(`${V2_PREFIX}:`)
      ? this.decryptV2(stored)
      : this.decryptV1(stored);

    return this.encrypt(plain, this.current);
  }

  private encrypt(plain: string, { id, key }: DerivedKey): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    cipher.setAAD(Buffer.from(`${V2_PREFIX}:${id}`, 'utf8'));

    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

    return [
      V2_PREFIX,
      id,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private decryptV2(stored: string): string {
    const [, id, iv, tag, encrypted] = stored.split(':');

    if (!id || !iv || !tag || !encrypted) {
      throw new Error(UNREADABLE_MESSAGE);
    }

    const key = this.byId.get(id);

    if (key === undefined) {
      throw new Error(
        `Unable to decrypt SISP payload: no configured key matches the key id ${safeKeyId(id)}. Add the key that wrote it to previousAppKeys.`,
      );
    }

    return decrypt(key, Buffer.from(`${V2_PREFIX}:${id}`, 'utf8'), iv, tag, encrypted);
  }

  private decryptV1(stored: string): string {
    const [, iv, tag, encrypted] = stored.split(':');

    if (!iv || !tag || !encrypted) {
      throw new Error(UNREADABLE_MESSAGE);
    }

    for (const { key } of this.all) {
      try {
        return decrypt(key, V1_AAD, iv, tag, encrypted);
      } catch {}
    }

    throw new Error(UNREADABLE_MESSAGE);
  }
}

function decrypt(key: Buffer, aad: Buffer, iv: string, tag: string, encrypted: string): string {
  const ivBuffer = Buffer.from(iv, 'base64');
  const tagBuffer = Buffer.from(tag, 'base64');

  if (ivBuffer.length !== IV_LENGTH || tagBuffer.length !== TAG_LENGTH) {
    throw new Error(UNREADABLE_MESSAGE);
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, ivBuffer, { authTagLength: TAG_LENGTH });

    decipher.setAAD(aad);
    decipher.setAuthTag(tagBuffer);

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(UNREADABLE_MESSAGE);
  }
}

export function looksLikeEnvelope(value: string): boolean {
  return value.startsWith(`${V1_PREFIX}:`) || value.startsWith(`${V2_PREFIX}:`);
}

export function isEncryptedEnvelope(value: string): boolean {
  const parts = value.split(':');

  if (parts[0] === V2_PREFIX) {
    return (
      parts.length === 5 &&
      KEY_ID_PATTERN.test(parts[1] as string) &&
      isBase64(parts[2] as string, IV_LENGTH) &&
      isBase64(parts[3] as string, TAG_LENGTH) &&
      isBase64(parts[4] as string)
    );
  }

  if (parts[0] === V1_PREFIX) {
    return (
      parts.length === 4 &&
      isBase64(parts[1] as string, IV_LENGTH) &&
      isBase64(parts[2] as string, TAG_LENGTH) &&
      isBase64(parts[3] as string)
    );
  }

  return false;
}

function isBase64(value: string, length?: number): boolean {
  const decoded = Buffer.from(value, 'base64');

  if (decoded.toString('base64') !== value) {
    return false;
  }

  return length === undefined || decoded.length === length;
}

function safeKeyId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '');

  return cleaned.length > KEY_ID_MAX_LENGTH ? `${cleaned.slice(0, KEY_ID_MAX_LENGTH)}...` : cleaned;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
