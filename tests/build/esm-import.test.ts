import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const distEntry = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}, 180_000);

it('imports the built ESM bundle under the Node ESM loader', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import(${JSON.stringify(distEntry)}).then((module) => process.stdout.write(typeof module.createSisp))`,
    ],
    { encoding: 'utf8' },
  );

  expect(output).toBe('function');
});
