import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { createSisp } from '../../src/application/create-sisp';
import { runCli } from '../../src/presentation/cli/run';

const dir = mkdtempSync(join(tmpdir(), 'sisp-rotate-cli-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sisp rotate-key', () => {
  it('reports how many rows it rewrote', async () => {
    const lines: string[] = [];
    const config = {
      posId: '90051',
      posAutCode: 'code',
      appKey: 'only-key',
      allowWeakAppKey: true,
      database: {
        client: 'better-sqlite3' as const,
        connection: { filename: join(dir, 'cli.db') },
        autoMigrate: true,
      },
    };

    const code = await runCli(['rotate-key', '--batch', '10'], {
      loadConfig: async () => config,
      output: (line) => lines.push(line),
    });

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Rewrote 0');
  });

  it('rejects a non-positive batch', async () => {
    const lines: string[] = [];
    const config = {
      posId: '90051',
      posAutCode: 'code',
      appKey: 'only-key',
      database: {
        client: 'better-sqlite3' as const,
        connection: { filename: join(dir, 'invalid-batch.db') },
        autoMigrate: true,
      },
    };

    const code = await runCli(['rotate-key', '--batch', '0'], {
      loadConfig: async () => config,
      output: (line) => lines.push(line),
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('--batch expects a positive integer');
  });

  it('exits with 2 and names every row it could not re-encrypt', async () => {
    const filename = join(dir, 'unreadable.db');
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };
    const base = { posId: '90051', posAutCode: 'code', database, allowWeakAppKey: true };

    const writer = await createSisp({ ...base, appKey: 'retired-key' });

    try {
      await writer.models.transactions.create({
        merchantRef: 'REF-CLI-FAIL',
        merchantSession: 'SES-CLI-FAIL',
        amount: 1000,
        payload: { posID: '90051' },
      });
    } finally {
      await writer.destroy();
    }

    const lines: string[] = [];
    const code = await runCli(['rotate-key'], {
      loadConfig: async () => ({ ...base, appKey: 'unrelated-key' }),
      output: (line) => lines.push(line),
    });
    const output = lines.join('\n');

    expect(code).toBe(2);
    expect(output).toContain('1 row was unreadable with the configured keys and left unchanged.');
    expect(output).not.toContain('already encrypted under the current appKey');
    expect(output).toContain('1 encrypted value could not be read:');
    expect(output).toContain('transactions#1 (payload): Unable to decrypt SISP payload');
    expect(output).toContain(
      'Keep the old key in previousAppKeys until no values are reported here.',
    );
  });

  it('never claims a row is on the current key when it holds plaintext', async () => {
    const filename = join(dir, 'plaintext.db');
    const database = {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    };
    const base = { posId: '90051', posAutCode: 'code', database, allowWeakAppKey: true };

    const writer = await createSisp({ ...base, appKey: 'retired-key' });

    try {
      await writer.models.transactions.create({
        merchantRef: 'REF-CLI-PLAIN',
        merchantSession: 'SES-CLI-PLAIN',
        amount: 1000,
        payload: { posID: '90051' },
      });
    } finally {
      await writer.destroy();
    }

    const raw = new Database(filename);

    try {
      raw.prepare(`update ${DEFAULT_TABLES.transactions} set payload = ?`).run('{"posID":"90051"}');
    } finally {
      raw.close();
    }

    const lines: string[] = [];
    const code = await runCli(['rotate-key'], {
      loadConfig: async () => ({ ...base, appKey: 'unrelated-key' }),
      output: (line) => lines.push(line),
    });
    const output = lines.join('\n');

    expect(code).toBe(0);
    expect(output).toContain('1 row was never encrypted and left unchanged.');
    expect(output).not.toContain('already encrypted under the current appKey');
  });

  it('lists the command in the usage text', async () => {
    const lines: string[] = [];

    await runCli(['help'], { output: (line) => lines.push(line) });

    expect(lines.join('\n')).toContain('rotate-key');
  });
});
