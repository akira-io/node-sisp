import { describe, expect, it } from 'vitest';
import { rowsAffected } from '../../../src/infrastructure/storage/drizzle/queries';

function postgresJsResult(count: number): unknown {
  const result = Object.assign([], { count, command: 'DELETE' });

  return result;
}

describe('rowsAffected', () => {
  it.each([
    ['better-sqlite3', { changes: 3 }, 3],
    ['node-postgres', { rowCount: 4 }, 4],
    ['mysql2', { affectedRows: 5 }, 5],
    ['mysql2 in an array header', [{ affectedRows: 6 }], 6],
  ])('reads the deleted count from a %s result', (_driver, result, expected) => {
    expect(rowsAffected(result)).toBe(expected);
  });

  it('reads the count off a postgres.js result array', () => {
    expect(rowsAffected(postgresJsResult(7))).toBe(7);
  });

  it('reports nothing deleted when the driver says nothing', () => {
    expect(rowsAffected(postgresJsResult(0))).toBe(0);
    expect(rowsAffected(undefined)).toBe(0);
  });
});
