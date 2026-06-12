import { describe, expect, it } from 'vitest';
import { credentialsFromConfig, resolveConfig, type SispConfig } from '../../src/config';
import { StaticCredentialsResolver } from '../../src/contracts/credentials-resolver';
import type { SispDriver } from '../../src/contracts/sisp-driver';
import { createSispManager } from '../../src/drivers/sisp-manager';

function managerFor(overrides: Partial<SispConfig> = {}) {
  const config = resolveConfig({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    url: 'https://gateway.vinti4.test/payment',
    baseUrl: 'http://localhost:3000',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    ...overrides,
  });

  return createSispManager(config, new StaticCredentialsResolver(credentialsFromConfig(config)));
}

describe('SispManager', () => {
  it('defaults to the production driver', () => {
    const driver = managerFor().driver();

    expect(driver.name()).toBe('production');
    expect(driver.paymentEndpoint()).toBe('https://gateway.vinti4.test/payment');
  });

  it('derives the sandbox driver from sandbox credentials', () => {
    const driver = managerFor({ sandbox: true }).driver();

    expect(driver.name()).toBe('sandbox');
    expect(driver.paymentEndpoint()).toBe('http://localhost:3000/sisp/sandbox');
  });

  it('honors an explicit driver over the sandbox flag', () => {
    expect(managerFor({ sandbox: true, driver: 'production' }).driver().name()).toBe('production');
  });

  it('resolves a named driver on demand', () => {
    expect(managerFor().driver('sandbox').name()).toBe('sandbox');
  });

  it('supports custom drivers through extend', () => {
    const custom: SispDriver = {
      name: () => 'custom',
      paymentEndpoint: () => 'https://custom.test',
    };

    const manager = managerFor().extend('custom', () => custom);

    expect(manager.driver('custom')).toBe(custom);
  });

  it('throws for unknown drivers', () => {
    expect(() => managerFor().driver('missing')).toThrow('SISP driver [missing] is not registered.');
  });
});
