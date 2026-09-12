import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveStatelessConfig } from '../../src/application/stateless-config';

describe('resolveStatelessConfig environment guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses sandbox mode in production unless explicitly allowed', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() =>
      resolveStatelessConfig({ posId: '90000045', posAutCode: 'code', sandbox: true }),
    ).toThrow('SISP sandbox mode is disabled when NODE_ENV is production');
    expect(
      resolveStatelessConfig({
        posId: '90000045',
        posAutCode: 'code',
        sandbox: true,
        allowSandboxInProduction: true,
      }).sandbox,
    ).toBe(true);
  });

  it('requires a strong appKey outside sandbox mode', () => {
    expect(() =>
      resolveStatelessConfig({ posId: '90000045', posAutCode: 'code', appKey: 'short' }),
    ).toThrow('SISP appKey must be at least 32 characters outside sandbox mode.');
    expect(
      resolveStatelessConfig({
        posId: '90000045',
        posAutCode: 'code',
        appKey: 'short',
        allowWeakAppKey: true,
      }).appKey,
    ).toBe('short');
  });
});

describe('resolveStatelessConfig', () => {
  it('applies the same defaults as the stateful resolver', () => {
    const resolved = resolveStatelessConfig({ posId: '90000045', posAutCode: 'code' });

    expect(resolved.currency).toBe('132');
    expect(resolved.languageMessages).toBe('EN');
    expect(resolved.fingerprintVersion).toBe('1');
    expect(resolved.is3DSec).toBe('0');
    expect(resolved.transactionCode).toBe('1');
    expect(resolved.basePath).toBe('/sisp');
    expect(resolved.redirectUrl).toBe('/');
    expect(resolved.sandbox).toBe(false);
    expect(resolved.appKey).toBeNull();
    expect(resolved.correlation).toBeNull();
  });

  it('never throws for a missing storage or database', () => {
    expect(() => resolveStatelessConfig({ posId: 'a', posAutCode: 'b' })).not.toThrow();
  });

  it('keeps the supplied correlation store', () => {
    const correlation = {
      record: async () => {},
      claim: async () => ({ status: 'missing' as const }),
      markProcessed: async () => {},
    };

    expect(resolveStatelessConfig({ posId: 'a', posAutCode: 'b', correlation }).correlation).toBe(
      correlation,
    );
  });

  it('parses sandbox from the loose string forms', () => {
    expect(resolveStatelessConfig({ posId: 'a', posAutCode: 'b', sandbox: true }).sandbox).toBe(
      true,
    );
  });

  it('resolves generators to callables', () => {
    const resolved = resolveStatelessConfig({ posId: 'a', posAutCode: 'b' });

    expect(typeof resolved.generators.merchantReference()).toBe('string');
    expect(typeof resolved.generators.merchantSession()).toBe('string');
    expect(typeof resolved.generators.timeStamp()).toBe('string');
  });

  it('normalizes the base path so the generated URLs resolve', () => {
    const resolved = resolveStatelessConfig({
      posId: '90000045',
      posAutCode: 'code',
      basePath: '/pay/',
    });

    expect(resolved.basePath).toBe('/pay');
  });
});
