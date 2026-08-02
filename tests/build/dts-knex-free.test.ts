import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}, 180_000);

function distFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../dist/${path}`, import.meta.url)), 'utf8');
}

describe('public entry declarations stay knex-free', () => {
  it.each([
    'index.d.ts',
    'express/index.d.ts',
    'fastify/index.d.ts',
    'nest/index.d.ts',
    'prisma/index.d.ts',
  ])('dist/%s does not reference knex', (path) => {
    expect(distFile(path)).not.toMatch(/knex/i);
  });

  it('dist/knex/index.d.ts still exposes the knex-typed surface', () => {
    expect(distFile('knex/index.d.ts')).toMatch(/from 'knex'/);
  });
});
