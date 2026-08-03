import type { Knex } from 'knex';
import type { Sisp } from '../../../application/sisp';

export function knexOf(sisp: Sisp): Knex | undefined {
  return sisp.db as Knex | undefined;
}
