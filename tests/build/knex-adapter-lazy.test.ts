import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));
const chunkPattern = /^knex-storage-[A-Z0-9]+\.js$/;

it('emits the knex adapter as a chunk the ESM entry only reaches by dynamic import', () => {
  const chunks = readdirSync(dist).filter((name) => chunkPattern.test(name));

  expect(chunks).toHaveLength(1);

  const chunk = chunks[0] as string;
  const references = readdirSync(dist)
    .filter((name) => name.endsWith('.js') && name !== chunk)
    .flatMap((name) => {
      const source = readFileSync(`${dist}/${name}`, 'utf8');

      return [...source.matchAll(new RegExp(`.{0,10}"\\./${chunk}"`, 'g'))].map((match) => ({
        name,
        context: match[0],
      }));
    });

  expect(references.length).toBeGreaterThan(0);

  for (const reference of references) {
    expect(reference.context, `${reference.name} reaches the adapter statically`).toContain(
      'import("./',
    );
  }
});
