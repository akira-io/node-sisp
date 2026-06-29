import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { runMigrations } from '../../src/infrastructure/database/auto-migrate';
import { createKnexInstance } from '../../src/infrastructure/database/create-knex';
import { Blacklist } from '../../src/infrastructure/database/models/blacklist';
import { RateLimit } from '../../src/infrastructure/database/models/rate-limit';

let db: Knex;
let blacklist: Blacklist;
let rateLimits: RateLimit;

beforeEach(async () => {
  db = createKnexInstance({ client: 'better-sqlite3', connection: { filename: ':memory:' } });
  await runMigrations(db, DEFAULT_TABLES);
  blacklist = new Blacklist(db, DEFAULT_TABLES);
  rateLimits = new RateLimit(db, DEFAULT_TABLES);
});

afterEach(async () => {
  await db.destroy();
});

describe('Blacklist', () => {
  it('reports blacklisted identifiers with their reason', async () => {
    await blacklist.add({ type: 'ip', value: '10.0.0.1', reason: 'fraud', severity: 'high' });

    expect(await blacklist.isBlacklisted('ip', '10.0.0.1')).toBe(true);
    expect((await blacklist.find('ip', '10.0.0.1'))?.reason).toBe('fraud');
    expect(await blacklist.isBlacklisted('ip', '10.0.0.2')).toBe(false);
    expect(await blacklist.isBlacklisted('email', '10.0.0.1')).toBe(false);
  });

  it('ignores expired entries', async () => {
    await blacklist.add({ type: 'ip', value: '10.0.0.9', expiresInMinutes: -5 });

    expect(await blacklist.isBlacklisted('ip', '10.0.0.9')).toBe(false);
  });

  it('removes entries', async () => {
    await blacklist.add({ type: 'ip', value: '10.0.0.1' });

    expect(await blacklist.remove('ip', '10.0.0.1')).toBe(true);
    expect(await blacklist.remove('ip', '10.0.0.1')).toBe(false);
    expect(await blacklist.isBlacklisted('ip', '10.0.0.1')).toBe(false);
  });
});

describe('RateLimit', () => {
  const hit = (identifier = '10.0.0.1') =>
    rateLimits.hit({ identifier, limitType: 'ip', limit: 3, windowSeconds: 3600 });

  it('allows hits under the limit', async () => {
    expect(await hit()).toBe(false);
    expect(await hit()).toBe(false);
    expect(await hit()).toBe(false);
  });

  it('blocks once the limit is exceeded and stays blocked', async () => {
    await hit();
    await hit();
    await hit();

    expect(await hit()).toBe(true);
    expect(await hit()).toBe(true);
  });

  it('tracks identifiers independently', async () => {
    await hit();
    await hit();
    await hit();
    await hit();

    expect(await hit('10.0.0.2')).toBe(false);
  });

  it('resets the window after it expires', async () => {
    await hit();
    await hit();
    await hit();
    expect(await hit()).toBe(true);

    await db(DEFAULT_TABLES.rateLimits).update({
      reset_at: new Date(Date.now() - 1000).toISOString(),
    });

    expect(await hit()).toBe(false);
  });
});
