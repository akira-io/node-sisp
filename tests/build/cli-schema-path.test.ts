import { execFileSync } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

it('resolves the bundled Prisma schema from a package path containing spaces', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sisp cli '));

  await cp(join(root, 'dist'), join(base, 'dist'), { recursive: true });
  await cp(join(root, 'prisma'), join(base, 'prisma'), { recursive: true });

  const output = execFileSync(
    process.execPath,
    [join(base, 'dist', 'cli.js'), 'prisma', '--print'],
    {
      encoding: 'utf8',
    },
  );

  expect(output).toContain('model SispTransaction');
});
