import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SispConfig } from '../../src/application/config';
import { loadConfigFile, runCli } from '../../src/presentation/cli/run';

const SCHEMA_PATH = new URL('../../prisma/sisp.prisma', import.meta.url).pathname;

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
      'Migrated: 0003_create_transaction_attempts_table',
      'Migrated: 0004_create_payment_intents_table',
    ]);
  });

  it('reports when there is nothing to migrate', async () => {
    const filename = join(await mkdtemp(join(tmpdir(), 'sisp-cli-')), 'sisp.db');
    const config = memoryConfig({
      database: { client: 'better-sqlite3', connection: { filename } },
    });
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

describe('sisp prisma', () => {
  it('copies the schema to prisma/sisp.prisma by default and returns 0', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sisp-prisma-'));
    const dest = join(dir, 'prisma', 'sisp.prisma');
    const { lines, output } = capture();

    const code = await runCli(['prisma', '--out', dest], { output, schemaPath: SCHEMA_PATH });

    expect(code).toBe(0);
    expect(lines).toEqual([`Wrote ${dest}`]);

    const written = await readFile(dest, 'utf8');
    const source = await readFile(SCHEMA_PATH, 'utf8');

    expect(written).toBe(source);
  });

  it('refuses to overwrite without --force and returns 1; --force overwrites', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sisp-prisma-'));
    const dest = join(dir, 'sisp.prisma');
    await writeFile(dest, 'original');

    const { lines: lines1, output: output1 } = capture();
    const code1 = await runCli(['prisma', '--out', dest], {
      output: output1,
      schemaPath: SCHEMA_PATH,
    });

    expect(code1).toBe(1);
    expect(lines1[0]).toContain('Refusing to overwrite');
    expect(await readFile(dest, 'utf8')).toBe('original');

    const { lines: lines2, output: output2 } = capture();
    const code2 = await runCli(['prisma', '--out', dest, '--force'], {
      output: output2,
      schemaPath: SCHEMA_PATH,
    });

    expect(code2).toBe(0);
    expect(lines2).toEqual([`Wrote ${dest}`]);

    const source = await readFile(SCHEMA_PATH, 'utf8');

    expect(await readFile(dest, 'utf8')).toBe(source);
  });

  it('--print writes schema to output and creates no file', async () => {
    const { lines, output } = capture();

    const code = await runCli(['prisma', '--print'], { output, schemaPath: SCHEMA_PATH });

    expect(code).toBe(0);

    const source = await readFile(SCHEMA_PATH, 'utf8');

    expect(lines).toEqual([source]);
  });

  it('--models-only --print contains model blocks but not datasource or generator', async () => {
    const { lines, output } = capture();

    const code = await runCli(['prisma', '--print', '--models-only'], {
      output,
      schemaPath: SCHEMA_PATH,
    });

    expect(code).toBe(0);

    const printed = lines.join('\n');

    expect(printed).toContain('model SispTransaction');
    expect(printed).not.toContain('datasource');
    expect(printed).not.toContain('generator');
  });
});
