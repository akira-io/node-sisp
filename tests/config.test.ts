import { describe, expect, it } from 'vitest';
import {
  credentialsFromConfig,
  DEFAULT_TABLES,
  resolveConfig,
  routeUrl,
  type SispConfig,
} from '../src/application/config';

const minimalConfig: SispConfig = {
  posId: '90051',
  posAutCode: 'TEST_POS_AUT_CODE',
  database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
};

describe('resolveConfig', () => {
  it('applies the same defaults as config/sisp.php', () => {
    const resolved = resolveConfig(minimalConfig);

    expect(resolved.currency).toBe('132');
    expect(resolved.languageMessages).toBe('EN');
    expect(resolved.fingerprintVersion).toBe('1');
    expect(resolved.is3DSec).toBe('0');
    expect(resolved.transactionCode).toBe('1');
    expect(resolved.redirectUrl).toBe('/');
    expect(resolved.sandbox).toBe(false);
    expect(resolved.driver).toBeNull();
    expect(resolved.allowRetry).toBe(true);
    expect(resolved.tables).toEqual(DEFAULT_TABLES);
    expect(resolved.database.autoMigrate).toBe(false);
    expect(resolved.rateLimiting.enabled).toBe(true);
    expect(resolved.rateLimiting.perIp).toEqual({ enabled: true, limit: 100, windowSeconds: 3600 });
    expect(resolved.rateLimiting.perMerchant.limit).toBe(500);
    expect(resolved.rateLimiting.perUser.limit).toBe(50);
    expect(resolved.security.collectMetadata).toBe(true);
    expect(resolved.identifierGeneration).toEqual({
      maxAttempts: 5,
      collisionRetrySleepMs: 1000,
    });
    expect(resolved.retry).toEqual({ maxAttempts: 3 });
    expect(resolved.idempotency).toEqual({
      enabled: true,
      requestKeys: ['idempotency_key', 'checkout_intent_id'],
    });
    expect(resolved.paymentValidation).toMatchObject({
      maxAmount: 10_000_000,
      allowedCurrencies: ['132'],
      allowClientTransactionCode: false,
    });
  });

  it('keeps user overrides', () => {
    const resolved = resolveConfig({
      ...minimalConfig,
      sandbox: true,
      currency: '978',
      tables: { transactions: 'custom_transactions' },
      rateLimiting: { perIp: { limit: 5 } },
      identifierGeneration: { maxAttempts: 2, collisionRetrySleepMs: 0 },
      retry: { maxAttempts: 2 },
      idempotency: { enabled: false, requestKeys: ['payment_key'] },
      paymentValidation: {
        maxAmount: 1000,
        allowedCurrencies: ['132', '978'],
        allowClientTransactionCode: true,
      },
      database: { client: 'better-sqlite3', connection: ':memory:', autoMigrate: false },
    });

    expect(resolved.sandbox).toBe(true);
    expect(resolved.currency).toBe('978');
    expect(resolved.tables.transactions).toBe('custom_transactions');
    expect(resolved.tables.invoices).toBe('sisp_invoices');
    expect(resolved.rateLimiting.perIp.limit).toBe(5);
    expect(resolved.rateLimiting.perIp.windowSeconds).toBe(3600);
    expect(resolved.identifierGeneration.maxAttempts).toBe(2);
    expect(resolved.identifierGeneration.collisionRetrySleepMs).toBe(0);
    expect(resolved.retry.maxAttempts).toBe(2);
    expect(resolved.idempotency.enabled).toBe(false);
    expect(resolved.idempotency.requestKeys).toEqual(['payment_key']);
    expect(resolved.paymentValidation.maxAmount).toBe(1000);
    expect(resolved.paymentValidation.allowedCurrencies).toEqual(['132', '978']);
    expect(resolved.paymentValidation.allowClientTransactionCode).toBe(true);
    expect(resolved.database.autoMigrate).toBe(false);
  });

  it('normalizes runtime boolean strings', () => {
    const resolved = resolveConfig({
      ...minimalConfig,
      sandbox: 'true',
      allowRetry: 'false',
      rateLimiting: {
        enabled: 'false',
        perIp: { enabled: 'false' },
      },
      security: { collectMetadata: 'false' },
      database: { ...minimalConfig.database, autoMigrate: 'false' },
    } as unknown as SispConfig);

    expect(resolved.sandbox).toBe(true);
    expect(resolved.database.autoMigrate).toBe(false);
    expect(resolved.allowRetry).toBe(false);
    expect(resolved.rateLimiting.enabled).toBe(false);
    expect(resolved.rateLimiting.perIp.enabled).toBe(false);
    expect(resolved.security.collectMetadata).toBe(false);
  });

  it('defaults auto-migrate on for sandbox databases', () => {
    const resolved = resolveConfig({ ...minimalConfig, sandbox: true });

    expect(resolved.database.autoMigrate).toBe(true);
  });

  it('provides default generators matching the SISP formats', () => {
    const resolved = resolveConfig(minimalConfig);

    expect(resolved.generators.merchantReference()).toMatch(/^R[0-9a-z]{14}$/);
    expect(resolved.generators.merchantSession()).toMatch(/^S[0-9a-z]{14}$/);
    expect(resolved.generators.timeStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('allows custom generators', () => {
    const resolved = resolveConfig({
      ...minimalConfig,
      generators: { merchantReference: () => 'R-fixed' },
    });

    expect(resolved.generators.merchantReference()).toBe('R-fixed');
    expect(resolved.generators.merchantSession()).toMatch(/^S[0-9a-z]{14}$/);
  });
});

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
});
