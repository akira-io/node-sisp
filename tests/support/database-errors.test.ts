import { describe, expect, it } from 'vitest';
import {
  isIndexAlreadyExistsError,
  isUniqueConstraintError,
} from '../../src/support/database-errors';

describe('database error helpers', () => {
  it('detects unique constraint violations by driver codes', () => {
    expect(isUniqueConstraintError({ code: '23505' })).toBe(true);
    expect(isUniqueConstraintError({ code: 'ER_DUP_ENTRY' })).toBe(true);
    expect(isUniqueConstraintError({ errno: 1062 })).toBe(true);
    expect(isUniqueConstraintError({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true);
    expect(
      isUniqueConstraintError({
        code: 'SQLITE_CONSTRAINT',
        message: 'UNIQUE constraint failed: sisp_transactions.merchant_ref',
      }),
    ).toBe(true);
  });

  it('does not classify unrelated duplicate messages as unique constraints', () => {
    expect(
      isUniqueConstraintError({
        code: '23000',
        message: 'duplicate value rejected by another integrity rule',
      }),
    ).toBe(false);
    expect(
      isUniqueConstraintError({
        message: 'merchant reference must be unique across all providers',
      }),
    ).toBe(false);
  });

  it('uses narrow message fallbacks for drivers without structured codes', () => {
    expect(
      isUniqueConstraintError({
        message: 'duplicate key value violates unique constraint "transactions_merchant_ref"',
      }),
    ).toBe(true);
    expect(
      isUniqueConstraintError({
        message: 'UNIQUE constraint failed: sisp_transactions.merchant_ref',
      }),
    ).toBe(true);
  });

  it('detects existing index errors across supported drivers', () => {
    expect(isIndexAlreadyExistsError({ code: '42P07' })).toBe(true);
    expect(isIndexAlreadyExistsError({ code: 'ER_DUP_KEYNAME' })).toBe(true);
    expect(isIndexAlreadyExistsError({ errno: 1061 })).toBe(true);
    expect(
      isIndexAlreadyExistsError({
        sqlState: '42000',
        message: "Duplicate key name 'sisp_transactions_merchant_ref_unique'",
      }),
    ).toBe(true);
  });
});
