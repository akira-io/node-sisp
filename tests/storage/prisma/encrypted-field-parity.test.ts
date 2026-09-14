import { describe, expect, it } from 'vitest';
import { ENCRYPTED_COLUMNS } from '../../../src/core/contracts/maintenance';
import { PRISMA_ENCRYPTED_FIELDS } from '../../../src/infrastructure/storage/prisma/repositories/maintenance';

const declared = [
  ...new Set(ENCRYPTED_COLUMNS.flatMap(({ columns }) => columns.map((c) => c.name))),
]
  .sort()
  .join(',');

describe('prisma encrypted field map', () => {
  it('names exactly the columns ENCRYPTED_COLUMNS declares', () => {
    expect(Object.keys(PRISMA_ENCRYPTED_FIELDS).sort().join(',')).toBe(declared);
  });

  it('maps every declared column to the camelCase field the Prisma schema uses', () => {
    for (const { columns } of ENCRYPTED_COLUMNS) {
      for (const column of columns) {
        const expected = column.name.replace(/_(.)/g, (_, letter: string) => letter.toUpperCase());

        expect(PRISMA_ENCRYPTED_FIELDS[column.name]).toBe(expected);
      }
    }
  });
});
