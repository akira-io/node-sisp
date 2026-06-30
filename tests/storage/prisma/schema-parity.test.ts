import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DELEGATE_NAMES } from '../../../src/infrastructure/storage/prisma/client';

function modelNames(schemaPath: string): string[] {
  const source = readFileSync(schemaPath, 'utf8');
  const names = [...source.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] as string);

  return names.sort();
}

function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

const shippedSchema = resolve(__dirname, '../../../prisma/sisp.prisma');
const fixtureSchema = resolve(__dirname, './fixture.prisma');

describe('prisma schema parity', () => {
  it('shipped schema and test fixture declare the same model names', () => {
    expect(modelNames(shippedSchema)).toEqual(modelNames(fixtureSchema));
  });

  it('camelCased model names equal the adapter DELEGATE_NAMES', () => {
    const delegates = [...Object.values(DELEGATE_NAMES)].sort();
    const camelCased = modelNames(shippedSchema).map(camelCase).sort();

    expect(camelCased).toEqual(delegates);
  });
});
