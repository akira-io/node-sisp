import { describe, expect, it, vi } from 'vitest';
import { lockRowForUpdate } from '../../../src/infrastructure/storage/prisma/locking';

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
    expect(value).toBe(42);
  });

  it('uses backtick quoting for mysql', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'mysql', 'sisp_transactions', 'id', 7);

    expect(exec).toHaveBeenCalledOnce();

    const [sql] = exec.mock.calls[0] as [string];

    expect(sql).toContain('`sisp_transactions`');
    expect(sql).toContain('`id`');
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

  it('locks on a composite WHERE across multiple columns', async () => {
    const exec = vi.fn().mockResolvedValue([]);

    await lockRowForUpdate(exec, 'postgresql', 'sisp_transactions', [
      { column: 'merchant_ref', value: 'REF' },
      { column: 'merchant_session', value: 'SESSION' },
    ]);

    expect(exec).toHaveBeenCalledOnce();

    const [sql, ...values] = exec.mock.calls[0] as [string, ...unknown[]];

    expect(sql).toContain('"merchant_ref" = ?');
    expect(sql).toContain('"merchant_session" = ?');
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
