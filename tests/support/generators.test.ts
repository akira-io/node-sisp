import { describe, expect, it } from 'vitest';
import {
  generateMerchantReference,
  generateMerchantSession,
  generateTimeStamp,
} from '../../src/support/generators';

const fixedDate = new Date(2024, 0, 15, 14, 30, 5);

describe('generators', () => {
  it('builds the merchant reference as R plus a compact timestamp', () => {
    expect(generateMerchantReference(fixedDate)).toBe('R20240115143005');
  });

  it('builds the merchant session as S plus a compact timestamp', () => {
    expect(generateMerchantSession(fixedDate)).toBe('S20240115143005');
  });

  it('formats the SISP timestamp as Y-m-d H:i:s', () => {
    expect(generateTimeStamp(fixedDate)).toBe('2024-01-15 14:30:05');
  });

  it('defaults to the current clock', () => {
    expect(generateMerchantReference()).toMatch(/^R\d{14}$/);
    expect(generateMerchantSession()).toMatch(/^S\d{14}$/);
    expect(generateTimeStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
