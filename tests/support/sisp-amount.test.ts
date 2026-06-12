import { describe, expect, it } from 'vitest';
import { toCents, toThousandths } from '../../src/support/sisp-amount';

describe('toThousandths', () => {
  it.each([
    ['decimal string', '8.03', 8030],
    ['decimal float', 8.03, 8030],
    ['already whole amount', 1000, 1000000],
    ['two decimals', '100.50', 100500],
    ['three decimals', '0.001', 1],
    ['rounds fourth decimal up', '8.0295', 8030],
    ['keeps fourth decimal below half down', '8.0294', 8029],
    ['ignores digits beyond the fourth decimal', '8.03001', 8030],
    ['bare fraction', '.5', 500],
    ['explicit plus sign', '+3.2', 3200],
    ['negative amount', '-7.0005', -7001],
    ['negative float', -7.0005, -7001],
    ['padded units', '0012', 12000],
    ['whitespace around the value', ' 25 ', 25000],
    ['empty string', '', 0],
    ['non-numeric string', 'abc', 0],
    ['leading numeric prefix', '12abc', 12000],
    ['scientific notation falls back to float parsing', '1e3', 1000000],
    ['zero', 0, 0],
  ] as const)('%s', (_label, amount, expected) => {
    expect(toThousandths(amount)).toBe(expected);
  });
});

describe('toCents', () => {
  it.each([
    ['decimal string', '8.03', 803],
    ['decimal float', 8.03, 803],
    ['whole amount', 1000, 100000],
    ['rounds half cent up', '8.025', 803],
    ['keeps below half cent down', '8.024', 802],
    ['negative amount rounds away from zero', '-8.025', -803],
  ] as const)('%s', (_label, amount, expected) => {
    expect(toCents(amount)).toBe(expected);
  });
});
