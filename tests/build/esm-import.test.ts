import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const distEntry = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

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
