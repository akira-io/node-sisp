import type { Knex } from 'knex';

export function lockForUpdate<TBuilder extends Knex.QueryBuilder>(
  db: Knex,
  query: TBuilder,
): TBuilder {
  if (['better-sqlite3', 'sqlite3'].includes(String(db.client.config.client))) {
    return query;
  }

  return query.forUpdate() as TBuilder;
}
