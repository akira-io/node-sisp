import { createHmac } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  credentialsFromConfig,
  type DeepPartial,
  type RateLimiting,
  type ResolvedSispConfig,
  resolveConfig,
} from '../../src/application/config';
import { PaymentContext } from '../../src/application/pipelines/payment/payment-context';
import { EnforceRateLimits } from '../../src/application/pipelines/payment/pipes/enforce-rate-limits';
import { resolveRateLimiting } from '../../src/application/rate-limiting';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { RateLimitExceededError } from '../../src/domain/errors/exceptions';
import type { PaymentRequestData } from '../../src/domain/value-objects/payment-request-data';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import { runMigrations } from '../../src/infrastructure/storage/knex/auto-migrate';
import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';

let db: Knex;
let config: ResolvedSispConfig;
let storage: KnexStorage;

beforeEach(async () => {
  config = resolveConfig({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    url: 'https://gateway.vinti4.test/payment',
    appKey: 'app-key-with-thirty-two-characters!',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
  const database = config.database;

  if (!database) throw new Error('database config missing');

  storage = await KnexStorage.create(database, config.tables, config.appKey);
  db = storage.raw;
  await runMigrations(db, config.tables);
});

afterEach(async () => {
  await storage.destroy();
});

function pipe(overrides: DeepPartial<RateLimiting>, posId = '90051'): EnforceRateLimits {
  return new EnforceRateLimits(
    storage.rateLimits,
    resolveRateLimiting(overrides),
    new StaticCredentialsResolver({ ...credentialsFromConfig(config), posId }),
    config.appKey,
  );
}

function request(ip: string): HttpRequestInfo {
  return { ip, method: 'POST', path: '/sisp/payment', headers: {}, query: {}, body: {} };
}

function run(
  enforce: EnforceRateLimits,
  ip: string,
  data: Partial<PaymentRequestData> = {},
): Promise<void> {
  return enforce.handle(new PaymentContext({ amount: 1500, ...data }, request(ip)), async () => {});
}

async function identifiers(limitType: string): Promise<string[]> {
  const rows = (await db(config.tables.rateLimits).where('limit_type', limitType)) as {
    identifier: string;
  }[];

  return rows.map((row) => row.identifier);
}

describe('rateLimiting.perMerchant', () => {
  it('caps requests for the merchant across different client ips', async () => {
    const enforce = pipe({
      perIp: { enabled: false },
      perUser: { enabled: false },
      perMerchant: { enabled: true, limit: 2, windowSeconds: 3600 },
    });

    await run(enforce, '10.0.0.1');
    await run(enforce, '10.0.0.2');

    await expect(run(enforce, '10.0.0.3')).rejects.toThrow(RateLimitExceededError);
    expect(await identifiers('merchant')).toEqual(['90051']);
  });

  it('gives each merchant its own bucket', async () => {
    const rules: DeepPartial<RateLimiting> = {
      perIp: { enabled: false },
      perUser: { enabled: false },
      perMerchant: { enabled: true, limit: 1, windowSeconds: 3600 },
    };

    await run(pipe(rules, '90051'), '10.0.0.1');
    await run(pipe(rules, '70001'), '10.0.0.1');

    await expect(run(pipe(rules, '70001'), '10.0.0.1')).rejects.toThrow(RateLimitExceededError);
    expect((await identifiers('merchant')).sort()).toEqual(['70001', '90051']);
  });

  it('is skipped when the rule is disabled', async () => {
    const enforce = pipe({
      perIp: { enabled: false },
      perUser: { enabled: false },
      perMerchant: { enabled: false, limit: 1 },
    });

    await run(enforce, '10.0.0.1');
    await run(enforce, '10.0.0.2');

    expect(await identifiers('merchant')).toEqual([]);
  });
});

describe('rateLimiting.perUser', () => {
  it('caps requests for the customer across different client ips', async () => {
    const enforce = pipe({
      perIp: { enabled: false },
      perMerchant: { enabled: false },
      perUser: { limit: 2, windowSeconds: 3600 },
    });
    const customer = { customerEmail: 'Cliente@Example.CV' };

    await run(enforce, '10.0.0.1', customer);
    await run(enforce, '10.0.0.2', { customerEmail: 'cliente@example.cv' });

    await expect(run(enforce, '10.0.0.3', customer)).rejects.toThrow(RateLimitExceededError);
    await run(enforce, '10.0.0.4', { customerEmail: 'outro@example.cv' });
  });

  it('falls back to the customer phone and hashes the identity', async () => {
    const enforce = pipe({
      perIp: { enabled: false },
      perMerchant: { enabled: false },
      perUser: { limit: 1, windowSeconds: 3600 },
    });

    await run(enforce, '10.0.0.1', { customerPhone: '+2389911223' });

    await expect(run(enforce, '10.0.0.2', { customerPhone: '+2389911223' })).rejects.toThrow(
      RateLimitExceededError,
    );
    expect(await identifiers('user')).toEqual([
      createHmac('sha256', config.appKey ?? '')
        .update('+2389911223', 'utf8')
        .digest('hex'),
    ]);
  });

  it('prefers the email over the phone when both are present', async () => {
    const rules: DeepPartial<RateLimiting> = {
      perIp: { enabled: false },
      perMerchant: { enabled: false },
      perUser: { enabled: true, limit: 1, windowSeconds: 3600 },
    };

    await run(pipe(rules), '10.0.0.1', {
      customerEmail: 'cliente@example.cv',
      customerPhone: '+2389911223',
    });

    await expect(
      run(pipe(rules), '10.0.0.2', {
        customerEmail: 'cliente@example.cv',
        customerPhone: '+2380000000',
      }),
    ).rejects.toThrow(RateLimitExceededError);
    await run(pipe(rules), '10.0.0.3', {
      customerEmail: 'outro@example.cv',
      customerPhone: '+2389911223',
    });
  });

  it('is skipped when the request carries no customer identity', async () => {
    const enforce = pipe({
      perIp: { enabled: false },
      perMerchant: { enabled: false },
      perUser: { limit: 1, windowSeconds: 3600 },
    });

    await run(enforce, '10.0.0.1');
    await run(enforce, '10.0.0.2');

    expect(await identifiers('user')).toEqual([]);
  });
});

describe('rateLimiting.enabled', () => {
  it('skips every scope when the whole feature is off', async () => {
    const enforce = pipe({
      enabled: false,
      perMerchant: { enabled: true, limit: 1 },
      perUser: { limit: 1 },
    });

    await run(enforce, '10.0.0.1', { customerEmail: 'cliente@example.cv' });
    await run(enforce, '10.0.0.1', { customerEmail: 'cliente@example.cv' });

    expect(await db(config.tables.rateLimits).count({ total: 'id' })).toEqual([{ total: 0 }]);
  });

  it('counts each configured scope once per request', async () => {
    const enforce = pipe({
      perIp: { limit: 9 },
      perMerchant: { enabled: true, limit: 9 },
      perUser: { limit: 9 },
    });

    await run(enforce, '10.0.0.1', { customerEmail: 'cliente@example.cv' });

    const rows = (await db(config.tables.rateLimits).orderBy('limit_type')) as {
      limit_type: string;
      hits: number;
    }[];

    expect(rows.map((row) => row.limit_type)).toEqual(['ip', 'merchant', 'user']);
    expect(rows.every((row) => row.hits === 1)).toBe(true);
  });
});
