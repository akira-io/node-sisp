import { createHmac, randomUUID } from 'node:crypto';
import { constantTimeEquals } from '../infrastructure/fingerprints/hash';
import { deriveSispKey } from './key-derivation';

export interface SignedAction {
  nonce: string;
  expiresAt: Date;
}

export class UrlSigner {
  private readonly key: Buffer | null;

  constructor(appKey: string | null) {
    this.key = appKey === null || appKey === '' ? null : deriveSispKey(appKey, 'url-signing');
  }

  sign(path: string, params: Record<string, string | number>, expiresAt?: Date): string {
    const query: Record<string, string> = {};

    for (const [name, value] of Object.entries(params)) {
      query[name] = String(value);
    }

    if (expiresAt) {
      query.expires = String(Math.floor(expiresAt.getTime() / 1000));
    }

    query.signature = this.signature(path, query);

    return `${path}?${canonicalQuery(query)}`;
  }

  signAction(path: string, params: Record<string, string | number>, expiresAt: Date): string {
    return this.sign(path, { ...params, jti: randomUUID() }, expiresAt);
  }

  validate(path: string, query: Record<string, unknown>): boolean {
    return this.signedParams(path, query) !== null;
  }

  validateAction(path: string, query: Record<string, unknown>): SignedAction | null {
    const signed = this.signedParams(path, query);

    if (signed === null) {
      return null;
    }

    const expiresAt = parseExpiration(signed.params.expires);

    if (expiresAt === null) {
      return null;
    }

    const nonce = signed.params.jti;

    if (nonce === undefined || nonce === '') {
      return null;
    }

    return { nonce, expiresAt: new Date(expiresAt) };
  }

  private signedParams(
    path: string,
    query: Record<string, unknown>,
  ): { params: Record<string, string>; signature: string } | null {
    const signature = query.signature;

    if (typeof signature !== 'string' || signature === '') {
      return null;
    }

    const params: Record<string, string> = {};

    for (const [name, value] of Object.entries(query)) {
      if (name !== 'signature' && (typeof value === 'string' || typeof value === 'number')) {
        params[name] = String(value);
      }
    }

    if (!constantTimeEquals(this.signature(path, params), signature)) {
      return null;
    }

    if (!hasFreshExpiration(params.expires)) {
      return null;
    }

    return { params, signature };
  }

  private signature(path: string, params: Record<string, string>): string {
    if (this.key === null) {
      throw new Error('Signed SISP URLs require an appKey in the configuration.');
    }

    return createHmac('sha256', this.key)
      .update(`${path}?${canonicalQuery(params)}`, 'utf8')
      .digest('hex');
  }
}

function hasFreshExpiration(expires: string | undefined): boolean {
  if (expires === undefined) {
    return true;
  }

  const expiresAt = parseExpiration(expires);

  return expiresAt !== null && expiresAt >= Date.now();
}

function parseExpiration(expires: string | undefined): number | null {
  if (expires === undefined) {
    return null;
  }

  const expiresAt = Number.parseInt(expires, 10);

  if (Number.isNaN(expiresAt)) {
    return null;
  }

  return expiresAt * 1000;
}

function canonicalQuery(params: Record<string, string>): string {
  const searchParams = new URLSearchParams();

  for (const name of Object.keys(params).sort()) {
    searchParams.append(name, params[name] as string);
  }

  return searchParams.toString();
}
