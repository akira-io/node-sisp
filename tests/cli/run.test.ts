import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfigFile, runCli } from '../../src/cli/run';
import type { SispConfig } from '../../src/config';

function memoryConfig(overrides: Partial<SispConfig> = {}): SispConfig {
  return {
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    ...overrides,
  };
}

function capture() {
  const lines: string[] = [];

  return { lines, output: (line: string) => lines.push(line) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sisp migrate', () => {
  it('runs the bundled migrations and reports them', async () => {
    const { lines, output } = capture();

    const code = await runCli(['migrate'], {
      loadConfig: async () => memoryConfig(),
      output,
    });

    expect(code).toBe(0);
    expect(lines).toEqual([
      'Migrated: 0001_create_sisp_tables',
      'Migrated: 0002_create_transaction_logs_table',
    ]);
  });

  it('reports when there is nothing to migrate', async () => {
    const filename = join(await mkdtemp(join(tmpdir(), 'sisp-cli-')), 'sisp.db');
    const config = memoryConfig({ database: { client: 'better-sqlite3', connection: { filename } } });
    const { lines, output } = capture();

    await runCli(['migrate'], { loadConfig: async () => config, output });
    lines.length = 0;
    const code = await runCli(['migrate'], { loadConfig: async () => config, output });

    expect(code).toBe(0);
    expect(lines).toEqual(['Nothing to migrate.']);
  });
});

describe('sisp reconcile-pending', () => {
  it('warns when reconciliation is disabled', async () => {
    const { lines, output } = capture();

    const code = await runCli(['reconcile-pending'], {
      loadConfig: async () => memoryConfig(),
      output,
    });

    expect(code).toBe(0);
    expect(lines).toEqual([
      'SISP transaction reconciliation is disabled. Use --force to run anyway.',
    ]);
  });

  it('reports when no pending transactions need reconciliation', async () => {
    const { lines, output } = capture();

    const code = await runCli(['reconcile-pending', '--force'], {
      loadConfig: async () =>
        memoryConfig({ transactionStatus: { portalId: 'p', portalPassword: 's' } }),
      output,
    });

    expect(code).toBe(0);
    expect(lines).toEqual(['No pending SISP transactions require reconciliation.']);
  });
});

describe('help and config loading', () => {
  it('prints usage for unknown commands with a failure code', async () => {
    const { lines, output } = capture();

    expect(await runCli(['wat'], { output })).toBe(1);
    expect(lines[0]).toBe('Usage: sisp <command>');
    expect(await runCli([], { output })).toBe(0);
  });

  it('loads sisp.config.json from the working directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'sisp-config-'));
    await writeFile(join(cwd, 'sisp.config.json'), JSON.stringify(memoryConfig()));

    const config = await loadConfigFile(cwd);

    expect(config.posId).toBe('90051');
  });

  it('fails clearly when no configuration exists', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'sisp-empty-'));

    await expect(loadConfigFile(cwd)).rejects.toThrow('No SISP configuration found.');
  });
});
