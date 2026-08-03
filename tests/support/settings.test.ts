import { describe, expect, it } from 'vitest';
import { booleanSetting } from '../../src/support/settings';

describe('booleanSetting', () => {
  it('passes booleans through', () => {
    expect(booleanSetting(true, false)).toBe(true);
    expect(booleanSetting(false, true)).toBe(false);
  });

  it('treats non-zero numbers as true', () => {
    expect(booleanSetting(1, false)).toBe(true);
    expect(booleanSetting(0, true)).toBe(false);
  });

  it('parses the documented string forms', () => {
    expect(booleanSetting('yes', false)).toBe(true);
    expect(booleanSetting('ON', false)).toBe(true);
    expect(booleanSetting('off', true)).toBe(false);
    expect(booleanSetting('', true)).toBe(false);
  });

  it('falls back on anything unrecognised', () => {
    expect(booleanSetting('maybe', true)).toBe(true);
    expect(booleanSetting(undefined, false)).toBe(false);
    expect(booleanSetting(null, true)).toBe(true);
  });
});
