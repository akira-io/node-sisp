import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

const CONSUMER = `
import { createSisp } from '@akira-io/sisp';
import { sispFastifyPlugin } from '@akira-io/sisp/fastify';
import { createPrismaStorage } from '@akira-io/sisp/prisma';

export const used = [createSisp, sispFastifyPlugin, createPrismaStorage];
`;

async function consumer(moduleType: 'commonjs' | 'module'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `sisp-consumer-${moduleType}-`));

  await mkdir(join(dir, 'node_modules', '@akira-io'), { recursive: true });
  await symlink(root, join(dir, 'node_modules', '@akira-io', 'sisp'), 'dir');
  await writeFile(join(dir, 'package.json'), JSON.stringify({ type: moduleType }));
  await writeFile(join(dir, 'index.ts'), CONSUMER);

  return dir;
}

function typecheck(dir: string, moduleResolution: ts.ModuleResolutionKind): string[] {
  const program = ts.createProgram([join(dir, 'index.ts')], {
    target: ts.ScriptTarget.ES2022,
    module:
      moduleResolution === ts.ModuleResolutionKind.Node10
        ? ts.ModuleKind.CommonJS
        : ts.ModuleKind.Node16,
    moduleResolution,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  });

  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
}

describe('the published package resolves for every consumer shape', () => {
  let commonjs = '';
  let esm = '';

  beforeAll(async () => {
    [commonjs, esm] = await Promise.all([consumer('commonjs'), consumer('module')]);
  });

  it('typechecks under node16 resolution from a CommonJS package', () => {
    expect(typecheck(commonjs, ts.ModuleResolutionKind.Node16)).toEqual([]);
  }, 30_000);

  it('typechecks under node16 resolution from an ESM package', () => {
    expect(typecheck(esm, ts.ModuleResolutionKind.Node16)).toEqual([]);
  }, 30_000);

  it('typechecks the subpaths under the legacy node resolution', () => {
    expect(typecheck(commonjs, ts.ModuleResolutionKind.Node10)).toEqual([]);
  }, 30_000);

  it('ships the licences and the changelog the README points at', () => {
    const packed = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: root,
      encoding: 'utf8',
    });
    const files = (JSON.parse(packed) as [{ files: { path: string }[] }])[0].files.map(
      (file) => file.path,
    );

    expect(files).toEqual(
      expect.arrayContaining(['LICENSE-MIT', 'LICENSE-APACHE', 'CHANGELOG.md', 'README.md']),
    );
    expect(files).not.toContain('dist/cli.cjs');
    expect(files).toContain('dist/cli.js');
  }, 30_000);

  it('loads the CommonJS bundle through require', () => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `process.stdout.write(typeof require(${JSON.stringify(join(root, 'dist', 'index.cjs'))}).createSisp)`,
      ],
      { encoding: 'utf8' },
    );

    expect(output).toBe('function');
  }, 30_000);
});
