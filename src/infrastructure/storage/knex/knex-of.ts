import type { Knex } from 'knex';
import type { Sisp } from '../../../application/sisp';

function isKnex(value: unknown): value is Knex {
  return (
    typeof value === 'function' &&
    typeof (value as Knex).transaction === 'function' &&
    typeof (value as Knex).destroy === 'function' &&
    typeof (value as Knex).raw === 'function'
  );
}

export function knexOf(sisp: Sisp): Knex | undefined {
  const storage = sisp.storage;

  if (!('raw' in storage)) {
    return undefined;
  }

  return isKnex(storage.raw) ? storage.raw : undefined;
}
