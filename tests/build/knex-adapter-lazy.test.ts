import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));
const chunkPattern = /^knex-storage-[A-Z0-9]+\.js$/;

function referencesTo(chunk: string): { name: string; context: string }[] {
  return readdirSync(dist)
    .filter((name) => name.endsWith('.js') && name !== chunk)
    .flatMap((name) => {
      const source = readFileSync(`${dist}/${name}`, 'utf8');

      return [...source.matchAll(new RegExp(`.{0,10}"\\./${chunk}"`, 'g'))].map((match) => ({
        name,
        context: match[0],
      }));
    });
}

it('emits the knex adapter as a chunk the ESM entries only reach by dynamic import', () => {
  const chunks = readdirSync(dist).filter((name) => chunkPattern.test(name));

  expect(chunks.length).toBeGreaterThan(0);

  for (const chunk of chunks) {
    const references = referencesTo(chunk);

    expect(references.length, `${chunk} is emitted but never referenced`).toBeGreaterThan(0);

    for (const reference of references) {
      expect(reference.context, `${reference.name} reaches the adapter statically`).toContain(
        'import("./',
      );
    }
  }
});
