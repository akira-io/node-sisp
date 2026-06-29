import { describe, expect, it } from 'vitest';
import {
  generateMerchantReference,
  generateMerchantSession,
  generateTimeStamp,
} from '../../src/support/generators';

const fixedDate = new Date(2024, 0, 15, 14, 30, 5);

describe('generators', () => {
  it('builds the merchant reference with timestamp and entropy', () => {
    expect(generateMerchantReference(fixedDate)).toMatch(/^R20240115143005[0-9a-f]{12}$/);
  });

  it('builds the merchant session with timestamp and entropy', () => {
    expect(generateMerchantSession(fixedDate)).toMatch(/^S20240115143005[0-9a-f]{12}$/);
  });

  it('adds entropy for identifiers generated in the same second', () => {
    const references = new Set(
      Array.from({ length: 32 }, () => generateMerchantReference(fixedDate)),
    );
    const sessions = new Set(Array.from({ length: 32 }, () => generateMerchantSession(fixedDate)));

    expect(references.size).toBe(32);
    expect(sessions.size).toBe(32);
  });

  it('formats the SISP timestamp as Y-m-d H:i:s', () => {
    expect(generateTimeStamp(fixedDate)).toBe('2024-01-15 14:30:05');
  });

  it('defaults to the current clock', () => {
    expect(generateMerchantReference()).toMatch(/^R\d{14}[0-9a-f]{12}$/);
    expect(generateMerchantSession()).toMatch(/^S\d{14}[0-9a-f]{12}$/);
    expect(generateTimeStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
