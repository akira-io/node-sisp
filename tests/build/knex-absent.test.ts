import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const blocker = fileURLToPath(new URL('./block-knex.mjs', import.meta.url));

function script(entry: string): string {
  return `
  const repository = () => new Proxy({}, { get: () => () => { throw new Error('unsupported'); } });
  const repositories = {
    transactions: repository(),
    transactionItems: repository(),
    transactionAttempts: repository(),
    paymentIntents: repository(),
    invoices: repository(),
    transactionLogs: repository(),
    blacklist: repository(),
    rateLimits: repository(),
    requestMetadata: repository(),
  };
  const storage = {
    ...repositories,
    transaction: (work) => work(repositories),
    destroy: async () => {},
  };

  await import('knex').then(
    () => { throw new Error('knex resolved, the blocking loader is not active'); },
    () => {},
  );

  const { createSisp } = await import(${JSON.stringify(entry)});
  const sisp = await createSisp({
    posId: '90051',
    posAutCode: 'X',
    appKey: 'app-key-with-thirty-two-characters!',
    storage,
  });

  process.stdout.write('db' in sisp ? 'leaked-handle' : 'ok');
  await sisp.destroy();
`;
}

it.each([
  'dist/index.js',
  'dist/index.cjs',
])('builds a Sisp from %s with an injected storage and knex absent', (entry) => {
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      blocker,
      '--input-type=module',
      '-e',
      script(fileURLToPath(new URL(`../../${entry}`, import.meta.url))),
    ],
    { encoding: 'utf8' },
  );

  expect(output).toBe('ok');
});
