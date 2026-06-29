import { describe, expect, it } from 'vitest';
import {
  credentialsFromConfig,
  resolveConfig,
  type SispConfig,
} from '../../src/application/config';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import type { SispDriver } from '../../src/core/contracts/sisp-driver';
import { createSispManager } from '../../src/infrastructure/drivers/sisp-manager';

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

  it('requires production gateway endpoints to be absolute HTTPS URLs', () => {
    expect(() => managerFor({ url: '' }).driver().paymentEndpoint()).toThrow(
      'SISP production payment URL must be an absolute HTTPS URL.',
    );
    expect(() =>
      managerFor({ url: 'http://gateway.vinti4.test/payment' }).driver().paymentEndpoint(),
    ).toThrow('SISP production payment URL must be an absolute HTTPS URL.');
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
      queryTransactionStatus: () => Promise.reject(new Error('not supported')),
    };

    const manager = managerFor().extend('custom', () => custom);

    expect(manager.driver('custom')).toBe(custom);
  });

  it('throws for unknown drivers', () => {
    expect(() => managerFor().driver('missing')).toThrow(
      'SISP driver [missing] is not registered.',
    );
  });
});
