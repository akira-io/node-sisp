import { hkdfSync } from 'node:crypto';

export type SispKeyPurpose = 'payload-encryption' | 'url-signing';

const SISP_KEY_SALT = Buffer.from('akira-io/node-sisp', 'utf8');

export function deriveSispKey(appKey: string, purpose: SispKeyPurpose): Buffer {
  if (appKey === '') {
    throw new Error('SISP key derivation requires a non-empty appKey.');
  }

  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(appKey, 'utf8'),
      SISP_KEY_SALT,
      Buffer.from(`node-sisp:${purpose}`, 'utf8'),
      32,
    ),
  );
}
