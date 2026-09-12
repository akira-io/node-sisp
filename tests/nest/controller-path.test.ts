import { describe, expect, it } from 'vitest';
import { controllerPath } from '../../src/presentation/nest/controller-path';

describe('controllerPath', () => {
  it('strips the leading slash from the base path', () => {
    expect(controllerPath('/sisp')).toBe('sisp');
  });

  it('keeps nested base paths', () => {
    expect(controllerPath('/billing/sisp')).toBe('billing/sisp');
  });

  it('strips trailing slashes', () => {
    expect(controllerPath('/pay/')).toBe('pay');
  });

  it('collapses repeated slashes', () => {
    expect(controllerPath('//pay//deep//')).toBe('pay/deep');
  });

  it('maps an empty base path to the root path', () => {
    expect(controllerPath('')).toBe('');
  });

  it('removes the global prefix so Nest does not apply it twice', () => {
    expect(controllerPath('/api/sisp', 'api')).toBe('sisp');
  });

  it('accepts a global prefix written with slashes', () => {
    expect(controllerPath('/api/sisp', '/api/')).toBe('sisp');
  });

  it('returns the root path when the base path is only the global prefix', () => {
    expect(controllerPath('/api', 'api')).toBe('');
  });

  it('rejects a base path that does not start with the global prefix', () => {
    expect(() => controllerPath('/sisp', 'api')).toThrow(/must start with the Nest global prefix/);
  });

  it('rejects a prefix that only matches part of the first segment', () => {
    expect(() => controllerPath('/apidocs/sisp', 'api')).toThrow(
      /must start with the Nest global prefix/,
    );
  });
});
