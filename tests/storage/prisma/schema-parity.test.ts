import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DELEGATE_NAMES } from '../../../src/infrastructure/storage/prisma/client';

function modelNames(schemaPath: string): string[] {
  const source = readFileSync(schemaPath, 'utf8');
  const names = [...source.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] as string);

  return names.sort();
}

function constraintsByModel(schemaPath: string): Record<string, string[]> {
  const source = readFileSync(schemaPath, 'utf8');
  const result: Record<string, string[]> = {};

  for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const body = match[2] as string;
    result[match[1] as string] = [...body.matchAll(/^\s*(@@(?:unique|index)\([^)]*\))/gm)]
      .map((line) => line[1] as string)
      .sort();
  }

  return result;
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

  it('shipped schema and test fixture declare the same unique and index constraints', () => {
    expect(constraintsByModel(shippedSchema)).toEqual(constraintsByModel(fixtureSchema));
  });

  it('shipped schema carries the identifier uniques the callback pipeline relies on', () => {
    const constraints = constraintsByModel(shippedSchema);

    expect(constraints.SispTransaction).toContain('@@unique([merchantRef])');
    expect(constraints.SispTransactionAttempt).toEqual(
      expect.arrayContaining([
        '@@unique([merchantSession])',
        '@@unique([merchantRef, merchantSession])',
        '@@unique([transactionId, attemptNumber])',
      ]),
    );
  });

  it('camelCased model names equal the adapter DELEGATE_NAMES', () => {
    const delegates = [...Object.values(DELEGATE_NAMES)].sort();
    const camelCased = modelNames(shippedSchema).map(camelCase).sort();

    expect(camelCased).toEqual(delegates);
  });
});
