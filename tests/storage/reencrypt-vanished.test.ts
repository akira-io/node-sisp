import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';

const dir = mkdtempSync(join(tmpdir(), 'sisp-vanished-'));
const OLD_KEY = 'vanished-old-key';
const NEW_KEY = 'vanished-new-key';

describe('reencryptBatch when a row disappears mid-rotation', () => {
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts the deleted row as vanished, never as current', async () => {
    const filename = join(dir, `${process.hrtime.bigint()}.db`);
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };

    const storage = await KnexStorage.create(database, DEFAULT_TABLES, OLD_KEY);

    await storage.migrate();

    const doomed = await storage.transactions.create({
      merchantRef: 'REF-VANISHED',
      merchantSession: 'SES-VANISHED',
      amount: 100,
      payload: { posID: '90051' },
    });
    const survivor = await storage.transactions.create({
      merchantRef: 'REF-VANISHED-NEXT',
      merchantSession: 'SES-VANISHED-NEXT',
      amount: 100,
      payload: { posID: '90052' },
    });

    const rotate = await KnexStorage.create(database, DEFAULT_TABLES, {
      current: NEW_KEY,
      previous: [OLD_KEY],
    });

    let deleted = false;

    rotate.raw.on('query-response', (_response, query: { sql: string }) => {
      if (deleted || !query.sql.startsWith('select `id`')) {
        return;
      }

      deleted = true;

      const writer = new Database(filename);

      writer.prepare(`delete from ${DEFAULT_TABLES.transactions} where id = ?`).run(doomed.id);
      writer.close();
    });

    const result = await rotate.maintenance.reencryptBatch({
      table: 'transactions',
      columns: [{ name: 'payload' }],
      afterId: doomed.id - 1,
      limit: 2,
    });

    expect(deleted).toBe(true);
    expect(result).toMatchObject({
      processed: 2,
      rewritten: 1,
      current: 0,
      plaintext: 0,
      unreadable: 0,
      vanished: 1,
    });
    expect(result.unreadableValues).toEqual([]);
    expect(result.lastId).toBe(survivor.id);

    await rotate.destroy();
    await storage.destroy();
  });
});
