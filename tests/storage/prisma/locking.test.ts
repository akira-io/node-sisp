import { describe, expect, it, vi } from 'vitest';
import {
  lockRowForUpdate,
  selectForUpdate,
} from '../../../src/infrastructure/storage/prisma/locking';

describe('lockRowForUpdate', () => {
  it('is a no-op for sqlite', async () => {
    const exec = vi.fn();

    await lockRowForUpdate(exec, 'sqlite', 'sisp_transactions', 'id', 1);

    expect(exec).not.toHaveBeenCalled();
  });

  it('emits FOR UPDATE for postgresql', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'postgresql', 'sisp_transactions', 'id', 42);

    expect(exec).toHaveBeenCalledOnce();

    const [sql, value] = exec.mock.calls[0] as [string, unknown];

    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('"sisp_transactions"');
    expect(sql).toContain('"id"');
    expect(sql).toContain('"id" = $1');
    expect(sql).not.toContain('?');
    expect(value).toBe(42);
  });

  it('uses backtick quoting and ? placeholders for mysql', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'mysql', 'sisp_transactions', 'id', 7);

    expect(exec).toHaveBeenCalledOnce();

    const [sql] = exec.mock.calls[0] as [string];

    expect(sql).toContain('`sisp_transactions`');
    expect(sql).toContain('`id`');
    expect(sql).toContain('`id` = ?');
    expect(sql).not.toContain('$1');
    expect(sql).toContain('FOR UPDATE');
  });

  it('escapes double-quotes in postgresql identifiers', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'postgresql', 'sisp"transactions', 'id', 1);

    const [sql] = exec.mock.calls[0] as [string];

    expect(sql).toContain('"sisp""transactions"');
  });

  it('escapes backticks in mysql identifiers', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'mysql', 'sisp`transactions', 'id', 1);

    const [sql] = exec.mock.calls[0] as [string];

    expect(sql).toContain('`sisp``transactions`');
  });

  it('locks on a composite WHERE with positional placeholders for postgresql', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'postgresql', 'sisp_transactions', [
      { column: 'merchant_ref', value: 'REF' },
      { column: 'merchant_session', value: 'SESSION' },
    ]);

    expect(exec).toHaveBeenCalledOnce();

    const [sql, ...values] = exec.mock.calls[0] as [string, ...unknown[]];

    expect(sql).toContain('"merchant_ref" = $1');
    expect(sql).toContain('"merchant_session" = $2');
    expect(sql).not.toContain('?');
    expect(sql).toContain(' AND ');
    expect(sql).toContain('FOR UPDATE');
    expect(values).toEqual(['REF', 'SESSION']);
  });

  it('locks on a composite WHERE with ? placeholders for mysql', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'mysql', 'sisp_transactions', [
      { column: 'merchant_ref', value: 'REF' },
      { column: 'merchant_session', value: 'SESSION' },
    ]);

    expect(exec).toHaveBeenCalledOnce();

    const [sql, ...values] = exec.mock.calls[0] as [string, ...unknown[]];

    expect(sql).toContain('`merchant_ref` = ?');
    expect(sql).toContain('`merchant_session` = ?');
    expect(sql).not.toContain('$1');
    expect(sql).toContain(' AND ');
    expect(sql).toContain('FOR UPDATE');
    expect(values).toEqual(['REF', 'SESSION']);
  });

  it('is a no-op for sqlite with composite columns', async () => {
    const exec = vi.fn();

    await lockRowForUpdate(exec, 'sqlite', 'sisp_transactions', [
      { column: 'merchant_ref', value: 'REF' },
      { column: 'merchant_session', value: 'SESSION' },
    ]);

    expect(exec).not.toHaveBeenCalled();
  });
});

describe('selectForUpdate', () => {
  it('emits SELECT * with FOR UPDATE for postgresql and returns the rows', async () => {
    const exec = vi.fn().mockResolvedValue([{ id: 1, hits: 3 }]);

    const rows = await selectForUpdate(exec, 'postgresql', 'sisp_rate_limits', [
      { column: 'identifier', value: '1.2.3.4' },
      { column: 'limit_type', value: 'payment' },
    ]);

    const [sql, ...values] = exec.mock.calls[0] as [string, ...unknown[]];

    expect(sql).toContain('SELECT * FROM "sisp_rate_limits"');
    expect(sql).toContain('"identifier" = $1');
    expect(sql).toContain('"limit_type" = $2');
    expect(sql).toContain('FOR UPDATE');
    expect(values).toEqual(['1.2.3.4', 'payment']);
    expect(rows).toEqual([{ id: 1, hits: 3 }]);
  });

  it('uses backtick quoting and ? placeholders for mysql', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await selectForUpdate(exec, 'mysql', 'sisp_rate_limits', [
      { column: 'identifier', value: '1.2.3.4' },
    ]);

    const [sql] = exec.mock.calls[0] as [string];

    expect(sql).toContain('SELECT * FROM `sisp_rate_limits`');
    expect(sql).toContain('`identifier` = ?');
    expect(sql).toContain('FOR UPDATE');
  });

  it('omits FOR UPDATE for sqlite but still returns the rows', async () => {
    const exec = vi.fn().mockResolvedValue([{ id: 9 }]);

    const rows = await selectForUpdate(exec, 'sqlite', 'sisp_rate_limits', [
      { column: 'id', value: 9 },
    ]);

    const [sql] = exec.mock.calls[0] as [string];

    expect(sql).not.toContain('FOR UPDATE');
    expect(sql).toContain('SELECT * FROM "sisp_rate_limits"');
    expect(rows).toEqual([{ id: 9 }]);
  });

  it('returns an empty array when the driver returns a non-array', async () => {
    const exec = vi.fn().mockResolvedValue(undefined);

    const rows = await selectForUpdate(exec, 'sqlite', 'sisp_rate_limits', [
      { column: 'id', value: 1 },
    ]);

    expect(rows).toEqual([]);
  });

  it('returns an empty array when no columns are given', async () => {
    const exec = vi.fn();

    const rows = await selectForUpdate(exec, 'postgresql', 'sisp_rate_limits', []);

    expect(exec).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });
});
