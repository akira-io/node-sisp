import knexFactory from 'knex';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { RateLimit } from '../../src/infrastructure/storage/knex/models/rate-limit';

type QueryConfig = { text: string; values: unknown[] };
type QueryCallback = (error: unknown, response: unknown) => void;

function recordingConnection(statements: string[]) {
  return {
    query(config: QueryConfig, callback: QueryCallback): void {
      statements.push(config.text);

      if (!config.text.toLowerCase().startsWith('select')) {
        callback(null, { command: 'UPDATE', rows: [], rowCount: 1 });

        return;
      }

      const selects = statements.filter((sql) => sql.toLowerCase().startsWith('select')).length;
      const rows =
        selects === 1
          ? []
          : [
              {
                id: 1,
                hits: 0,
                limit: 5,
                window_seconds: 60,
                reset_at: new Date(Date.now() + 60_000).toISOString(),
                is_blocked: false,
                blocked_until: null,
              },
            ];

      callback(null, { command: 'SELECT', rows, rowCount: rows.length });
    },
  };
}

describe('knex rate limit locking', () => {
  it('reads the row it just created through a locking select', async () => {
    const statements: string[] = [];
    const db = knexFactory({ client: 'pg', connection: {} });
    const client = db.client as unknown as Record<string, unknown>;
    const connection = recordingConnection(statements);

    client.acquireConnection = async () => connection;
    client.releaseConnection = async () => {};

    const rateLimits = new RateLimit(db, DEFAULT_TABLES);

    await rateLimits.hit({
      identifier: '203.0.113.10',
      limitType: 'ip',
      limit: 5,
      windowSeconds: 60,
    });

    const selects = statements.filter((sql) => sql.toLowerCase().startsWith('select'));

    expect(selects).toHaveLength(2);

    for (const sql of selects) {
      expect(sql).toContain('for update');
    }

    await db.destroy();
  });

  it('throws when the post-insert locking select returns no rows', async () => {
    const statements: string[] = [];
    const db = knexFactory({ client: 'pg', connection: {} });
    const client = db.client as unknown as Record<string, unknown>;
    const connection = {
      query(config: QueryConfig, callback: QueryCallback): void {
        statements.push(config.text);

        if (!config.text.toLowerCase().startsWith('select')) {
          callback(null, { command: 'UPDATE', rows: [], rowCount: 1 });

          return;
        }

        callback(null, { command: 'SELECT', rows: [], rowCount: 0 });
      },
    };

    client.acquireConnection = async () => connection;
    client.releaseConnection = async () => {};

    const rateLimits = new RateLimit(db, DEFAULT_TABLES);

    await expect(
      rateLimits.hit({
        identifier: '203.0.113.10',
        limitType: 'ip',
        limit: 5,
        windowSeconds: 60,
      }),
    ).rejects.toThrow('Rate limit row for ip:203.0.113.10 could not be read or created.');

    await db.destroy();
  });
});
