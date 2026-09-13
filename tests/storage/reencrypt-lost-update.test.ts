import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { PayloadCipher } from '../../src/infrastructure/storage/knex/encryption';
import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';

const dir = mkdtempSync(join(tmpdir(), 'sisp-lost-update-'));
const OLD_KEY = 'lost-update-old-key';
const NEW_KEY = 'lost-update-new-key';

function storedPayload(filename: string, id: number): string {
  const probe = new Database(filename, { readonly: true });

  try {
    const row = probe
      .prepare(`select payload from ${DEFAULT_TABLES.transactions} where id = ?`)
      .get(id) as { payload: string };

    return row.payload;
  } finally {
    probe.close();
  }
}

describe('reencryptBatch under a concurrent write', () => {
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rekeys the value the locked read returned, never the one the page scan saw', async () => {
    const filename = join(dir, `${process.hrtime.bigint()}.db`);
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };

    const storage = await KnexStorage.create(database, DEFAULT_TABLES, OLD_KEY);

    await storage.migrate();

    const transaction = await storage.transactions.create({
      merchantRef: 'REF-LOST-UPDATE',
      merchantSession: 'SES-LOST-UPDATE',
      amount: 100,
      payload: { posID: '90051' },
    });

    const rotate = await KnexStorage.create(database, DEFAULT_TABLES, {
      current: NEW_KEY,
      previous: [OLD_KEY],
    });

    const concurrent = new PayloadCipher(OLD_KEY).store({ posID: '90099' }) as string;
    let interposed = false;

    rotate.raw.on('query-response', (_response, query: { sql: string }) => {
      if (interposed || !query.sql.startsWith('select')) {
        return;
      }

      interposed = true;

      const writer = new Database(filename);

      writer
        .prepare(`update ${DEFAULT_TABLES.transactions} set payload = ? where id = ?`)
        .run(concurrent, transaction.id);
      writer.close();
    });

    const result = await rotate.maintenance.reencryptBatch({
      table: 'transactions',
      columns: [{ name: 'payload' }],
      afterId: transaction.id - 1,
      limit: 1,
    });

    expect(interposed).toBe(true);
    expect(result.rewritten).toBe(1);
    expect(result.vanished).toBe(0);
    expect(result.unreadableValues).toEqual([]);
    expect(result.lastId).toBe(transaction.id);
    expect(storedPayload(filename, transaction.id)).not.toBe(concurrent);

    const found = await rotate.transactions.findById(transaction.id);

    expect(found?.payload).toEqual({ posID: '90099' });
    await expect(storage.transactions.findById(transaction.id)).rejects.toThrow(
      /no configured key/,
    );

    await rotate.destroy();
    await storage.destroy();
  });
});
