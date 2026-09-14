import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import { runCli } from '../../src/presentation/cli/run';

const config = {
  posId: '90051',
  posAutCode: 'code',
  sandbox: true,
  appKey: 'app-key',
  database: {
    client: 'better-sqlite3' as const,
    connection: { filename: ':memory:' },
    autoMigrate: true,
  },
};

function capture() {
  const lines: string[] = [];

  return { lines, output: (line: string) => lines.push(line) };
}

describe('sisp prune-metadata', () => {
  it('reports how many rows it deleted', async () => {
    const { lines, output } = capture();

    const code = await runCli(['prune-metadata', '--older-than-days', '0'], {
      loadConfig: async () => config,
      output,
    });

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Deleted 0 request metadata rows.');
  });

  it('rejects a non-positive batch', async () => {
    const { lines, output } = capture();

    const code = await runCli(['prune-metadata', '--older-than-days', '1', '--batch', '0'], {
      loadConfig: async () => config,
      output,
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('--batch expects an integer between 1 and 999');
  });

  it('accepts the documented maximum batch and rejects the first value past it', async () => {
    const accepted = capture();
    const rejected = capture();

    const acceptedCode = await runCli(
      ['prune-metadata', '--older-than-days', '0', '--batch', '999'],
      { loadConfig: async () => config, output: accepted.output },
    );

    const rejectedCode = await runCli(
      ['prune-metadata', '--older-than-days', '0', '--batch', '1000'],
      { loadConfig: async () => config, output: rejected.output },
    );

    expect(acceptedCode).toBe(0);
    expect(accepted.lines.join('\n')).toContain('Deleted 0 request metadata rows.');
    expect(rejectedCode).toBe(1);
    expect(rejected.lines.join('\n')).toContain('--batch expects an integer between 1 and 999');
  });

  it('rejects a batch beyond what every dialect can bind', async () => {
    const { lines, output } = capture();

    const code = await runCli(['prune-metadata', '--older-than-days', '1', '--batch', '100000'], {
      loadConfig: async () => config,
      output,
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('--batch expects an integer between 1 and 999');
  });

  it('refuses to run without a retention window', async () => {
    const { lines, output } = capture();

    const code = await runCli(['prune-metadata'], {
      loadConfig: async () => config,
      output,
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('needs a retention window');
  });

  it('lists the command in the usage text', async () => {
    const { lines, output } = capture();

    await runCli(['help'], { output });

    expect(lines.join('\n')).toContain('prune-metadata');
  });

  it('reports without deleting anything when --dry-run is passed', async () => {
    const filename = join(await mkdtemp(join(tmpdir(), 'sisp-prune-dry-run-')), 'sisp.db');
    const fileConfig = {
      ...config,
      database: { ...config.database, connection: { filename } },
    };

    const sisp = await createSisp(fileConfig);
    const transaction = await sisp.models.transactions.create({
      merchantRef: 'REF-DRY-RUN-001',
      merchantSession: 'SES-DRY-RUN-001',
      amount: 1000,
    });

    await sisp.storage.requestMetadata.create({
      transaction_id: transaction.id,
      ip_address: '203.0.113.9',
    });

    await sisp.destroy();

    const { lines, output } = capture();

    const code = await runCli(['prune-metadata', '--older-than-days', '0', '--dry-run'], {
      loadConfig: async () => fileConfig,
      output,
    });

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Dry run: 1 request metadata rows would be deleted.');

    const verifySisp = await createSisp(fileConfig);

    try {
      expect(
        await verifySisp.storage.requestMetadata.listByTransaction(transaction.id),
      ).toHaveLength(1);
    } finally {
      await verifySisp.destroy();
    }
  });

  it('refuses --dry-run without a retention window', async () => {
    const { lines, output } = capture();

    const code = await runCli(['prune-metadata', '--dry-run'], {
      loadConfig: async () => config,
      output,
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('needs a retention window');
  });
});
