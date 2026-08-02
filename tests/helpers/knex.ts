import type { Knex } from 'knex';
import type { Sisp } from '../../src/application/sisp';
import { knexOf } from '../../src/infrastructure/storage/knex';

export function requireKnex(sisp: Sisp): Knex {
  const db = knexOf(sisp);

  if (db === undefined) {
    throw new Error('Expected a knex-backed Sisp instance in this test.');
  }

  return db;
}
