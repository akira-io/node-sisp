import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { DrizzleRow } from '../../../src/infrastructure/storage/drizzle';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';
import { fakeDatabase } from './fake-database';

const storedRow: DrizzleRow = {
  id: 42,
  merchant_ref: 'REF',
  merchant_session: 'SES',
  amount_cents: 1000,
  currency: '132',
  status: 'pending',
  locale: 'pt',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('MySQL insert without RETURNING', () => {
  it('reads the identifier off the driver result header', async () => {
    const { db } = fakeDatabase({
      insertResult: [{ insertId: 42, affectedRows: 1 }],
      rows: [storedRow],
    });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'mysql' });

    const created = await storage.transactions.create({
      merchantRef: 'REF',
      merchantSession: 'SES',
      amount: 10,
    });

    expect(created.id).toBe(42);
  });

  it('fails loudly when the driver returns no identifier', async () => {
    const { db } = fakeDatabase({ insertResult: [{ affectedRows: 1 }], rows: [storedRow] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'mysql' });

    await expect(
      storage.transactions.create({ merchantRef: 'REF', merchantSession: 'SES', amount: 10 }),
    ).rejects.toThrow('no identifier');
  });
});

describe('insert that ignores a conflict', () => {
  it('uses onDuplicateKeyUpdate on MySQL', async () => {
    const { db, recorder } = fakeDatabase({
      supportsOnDuplicateKey: true,
      supportsTransaction: true,
      supportsFor: true,
      rows: [],
    });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'mysql' });

    await expect(
      storage.rateLimits.hit({
        identifier: '203.0.113.1',
        limitType: 'payment',
        limit: 5,
        windowSeconds: 60,
      }),
    ).rejects.toThrow('could not be read or created');

    expect(recorder.calls).toContain('onDuplicateKeyUpdate');
  });

  it('uses onConflictDoNothing on Postgres', async () => {
    const { db, recorder } = fakeDatabase({
      supportsOnConflict: true,
      supportsTransaction: true,
      supportsFor: true,
      rows: [],
    });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'postgresql' });

    await expect(
      storage.rateLimits.hit({
        identifier: '203.0.113.1',
        limitType: 'payment',
        limit: 5,
        windowSeconds: 60,
      }),
    ).rejects.toThrow('could not be read or created');

    expect(recorder.calls).toContain('onConflictDoNothing');
  });
});

describe('row locking', () => {
  it('takes FOR UPDATE on Postgres', async () => {
    const { db, recorder } = fakeDatabase({ supportsFor: true, rows: [storedRow] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'postgresql' });

    await storage.transactions.findByIdForUpdate(42);

    expect(recorder.calls).toContain('for:update');
  });

  it('does not take FOR UPDATE on sqlite', async () => {
    const { db, recorder } = fakeDatabase({ supportsFor: true, rows: [storedRow] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'sqlite' });

    await storage.transactions.findByIdForUpdate(42);

    expect(recorder.calls).not.toContain('for:update');
  });
});

describe('timestamp binding', () => {
  it('binds ISO strings as Date on Postgres', async () => {
    const { db, recorder } = fakeDatabase({ supportsReturning: true, rows: [storedRow] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'postgresql' });

    await storage.transactions.create({ merchantRef: 'REF', merchantSession: 'SES', amount: 10 });

    expect(recorder.inserted[0]?.created_at).toBeInstanceOf(Date);
  });

  it('leaves ISO strings alone on sqlite', async () => {
    const { db, recorder } = fakeDatabase({ supportsReturning: true, rows: [storedRow] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'sqlite' });

    await storage.transactions.create({ merchantRef: 'REF', merchantSession: 'SES', amount: 10 });

    expect(typeof recorder.inserted[0]?.created_at).toBe('string');
  });
});

describe('unit of work', () => {
  it('refuses to run when the database exposes no transaction()', async () => {
    const { db } = fakeDatabase({ rows: [storedRow] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'postgresql' });

    await expect(storage.transaction(async () => 'never')).rejects.toThrow(
      'exposes no transaction()',
    );
  });

  it('delegates to the database transaction on Postgres', async () => {
    const { db, recorder } = fakeDatabase({ supportsTransaction: true, rows: [storedRow] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'postgresql' });

    expect(await storage.transaction(async () => 'done')).toBe('done');
    expect(recorder.calls).toContain('transaction');
  });
});

describe('raw statements', () => {
  it('falls back to execute() when the database has no run()', async () => {
    const { db, recorder } = fakeDatabase({ runner: 'execute', rows: [] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', {
      dialect: 'postgresql',
      autoMigrate: true,
    });

    await storage.migrate?.();

    expect(recorder.calls.filter((call) => call === 'execute').length).toBeGreaterThan(0);
  });

  it('fails when the database exposes neither run() nor execute()', async () => {
    const { db } = fakeDatabase({ runner: 'none', rows: [] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', {
      dialect: 'postgresql',
      autoMigrate: true,
    });

    await expect(storage.migrate?.()).rejects.toThrow('neither run() nor execute()');
  });

  it('does nothing when autoMigrate is off', async () => {
    const { db, recorder } = fakeDatabase({ runner: 'execute', rows: [] });
    const storage = createDrizzleStorage(db, DEFAULT_TABLES, 'app-key', { dialect: 'postgresql' });

    await storage.migrate?.();

    expect(recorder.calls).toEqual([]);
  });
});
