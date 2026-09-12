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

function fieldTypesByModel(schemaPath: string): Record<string, Record<string, string>> {
  const source = readFileSync(schemaPath, 'utf8');
  const result: Record<string, Record<string, string>> = {};

  for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const fields: Record<string, string> = {};

    for (const line of (match[2] as string).split('\n')) {
      const field = line.trim().match(/^(\w+)\s+(\w+\??)/);

      if (field === null || line.trim().startsWith('@@')) {
        continue;
      }

      fields[field[1] as string] = field[2] as string;
    }

    result[match[1] as string] = fields;
  }

  return result;
}

const SQLITE_SUBSTITUTIONS: Record<string, string> = {
  'Decimal?': 'Float?',
  Decimal: 'Float',
};

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

  it('shipped schema and test fixture declare the same field types', () => {
    const shipped = fieldTypesByModel(shippedSchema);
    const fixture = fieldTypesByModel(fixtureSchema);
    const expected: Record<string, Record<string, string>> = {};

    for (const [model, fields] of Object.entries(shipped)) {
      expected[model] = Object.fromEntries(
        Object.entries(fields).map(([field, type]) => [field, SQLITE_SUBSTITUTIONS[type] ?? type]),
      );
    }

    expect(fixture).toEqual(expected);
  });

  it('declares every column the adapter writes structured JSON into as Json', () => {
    const shipped = fieldTypesByModel(shippedSchema);

    expect(shipped.SispTransactionItem?.metadata).toBe('Json?');
    expect(shipped.SispInvoice?.metadata).toBe('Json?');
    expect(shipped.SispRequestMetadata?.customMetadata).toBe('Json?');
    expect(shipped.SispTransactionLog?.changedAttributes).toBe('Json');
    expect(shipped.SispTransactionLog?.oldValues).toBe('Json?');
    expect(shipped.SispTransactionLog?.newValues).toBe('Json?');
  });

  it('camelCased model names equal the adapter DELEGATE_NAMES', () => {
    const delegates = [...Object.values(DELEGATE_NAMES)].sort();
    const camelCased = modelNames(shippedSchema).map(camelCase).sort();

    expect(camelCased).toEqual(delegates);
  });
});
