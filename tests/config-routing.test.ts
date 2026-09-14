import { describe, expect, it } from 'vitest';
import {
  credentialsFromConfig,
  resolveConfig,
  routeUrl,
  type SispConfig,
} from '../src/application/config';

const minimalConfig: SispConfig = {
  posId: '90051',
  posAutCode: 'TEST_POS_AUT_CODE',
  database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
};

describe('credentialsFromConfig', () => {
  it('maps the resolved config onto credentials', () => {
    const credentials = credentialsFromConfig(
      resolveConfig({ ...minimalConfig, url: 'https://gateway.test', sandbox: true }),
    );

    expect(credentials.posId).toBe('90051');
    expect(credentials.posAutCode).toBe('TEST_POS_AUT_CODE');
    expect(credentials.url).toBe('https://gateway.test');
    expect(credentials.sandbox).toBe(true);
    expect(credentials.urlMerchantResponse).toBeNull();
  });
});

describe('routeUrl', () => {
  it('joins baseUrl, basePath, and the route name', () => {
    const resolved = resolveConfig({ ...minimalConfig, baseUrl: 'http://localhost:3000' });

    expect(routeUrl(resolved, 'callback')).toBe('http://localhost:3000/sisp/callback');
  });

  it('builds relative URLs when baseUrl is empty', () => {
    expect(routeUrl(resolveConfig(minimalConfig), 'sandbox')).toBe('/sisp/sandbox');
  });

  it('drops a trailing slash on the base path instead of doubling it', () => {
    const resolved = resolveConfig({ ...minimalConfig, basePath: '/pay/' });

    expect(resolved.basePath).toBe('/pay');
    expect(routeUrl(resolved, 'sandbox')).toBe('/pay/sandbox');
  });

  it('adds the leading slash a base path was written without', () => {
    const resolved = resolveConfig({
      ...minimalConfig,
      baseUrl: 'https://shop.test',
      basePath: 'pay',
    });

    expect(resolved.basePath).toBe('/pay');
    expect(routeUrl(resolved, 'callback')).toBe('https://shop.test/pay/callback');
  });

  it('collapses repeated slashes instead of scanning them', () => {
    const resolved = resolveConfig({ ...minimalConfig, basePath: '//pay//deep//' });

    expect(resolved.basePath).toBe('/pay/deep');
    expect(routeUrl(resolved, 'callback')).toBe('/pay/deep/callback');
  });

  it('serves from the root when the base path is a bare slash', () => {
    const resolved = resolveConfig({ ...minimalConfig, basePath: '/' });

    expect(resolved.basePath).toBe('');
    expect(routeUrl(resolved, 'callback')).toBe('/callback');
  });
});
