import { createHmac } from 'node:crypto';
import { constantTimeEquals } from '../fingerprints/hash';

export class UrlSigner {
  constructor(private readonly key: string | null) {}

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

  validate(path: string, query: Record<string, unknown>): boolean {
    const signature = query.signature;

    if (typeof signature !== 'string' || signature === '') {
      return false;
    }

    const params: Record<string, string> = {};

    for (const [name, value] of Object.entries(query)) {
      if (name !== 'signature' && (typeof value === 'string' || typeof value === 'number')) {
        params[name] = String(value);
      }
    }

    if (!constantTimeEquals(this.signature(path, params), signature)) {
      return false;
    }

    return !this.hasExpired(params.expires);
  }

  private hasExpired(expires: string | undefined): boolean {
    if (expires === undefined) {
      return false;
    }

    const expiresAt = Number.parseInt(expires, 10);

    return Number.isNaN(expiresAt) || expiresAt * 1000 < Date.now();
  }

  private signature(path: string, params: Record<string, string>): string {
    if (this.key === null || this.key === '') {
      throw new Error('Signed SISP URLs require an appKey in the configuration.');
    }

    return createHmac('sha256', this.key)
      .update(`${path}?${canonicalQuery(params)}`, 'utf8')
      .digest('hex');
  }
}

function canonicalQuery(params: Record<string, string>): string {
  const searchParams = new URLSearchParams();

  for (const name of Object.keys(params).sort()) {
    searchParams.append(name, params[name] as string);
  }

  return searchParams.toString();
}
