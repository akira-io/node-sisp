import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import { isIndexAlreadyExistsError } from '../../../../support/database-errors';
import { nowIso } from '../records';

interface RateLimitRow {
  id: number;
  identifier: string;
  limit_type: string;
  context: string;
  hits: number;
  limit: number;
  window_seconds: number;
  reset_at: string;
  is_blocked: boolean | number;
  blocked_until: string | null;
}

interface DuplicateRateLimitKey {
  identifier: string;
  limit_type: string;
  context: string;
}

export async function addRateLimitUniqueIndex(db: Knex, tables: SispTables): Promise<void> {
  if (!(await db.schema.hasTable(tables.rateLimits))) {
    return;
  }

  await db(tables.rateLimits).whereNull('context').update({ context: '' });
  await mergeDuplicateRateLimits(db, tables);

  try {
    await db.schema.alterTable(tables.rateLimits, (table) => {
      table.unique(['identifier', 'limit_type', 'context']);
    });
  } catch (error) {
    if (!isIndexAlreadyExistsError(error)) {
      throw error;
    }
  }
}

async function mergeDuplicateRateLimits(db: Knex, tables: SispTables): Promise<void> {
  const duplicateKeys = await db(tables.rateLimits)
    .select(['identifier', 'limit_type', 'context'])
    .count<{ count: number | string }>('id as count')
    .groupBy(['identifier', 'limit_type', 'context'])
    .havingRaw('COUNT(*) > 1');

  for (const key of duplicateKeys as DuplicateRateLimitKey[]) {
    await mergeDuplicateRateLimitKey(db, tables, key);
  }
}

async function mergeDuplicateRateLimitKey(
  db: Knex,
  tables: SispTables,
  key: DuplicateRateLimitKey,
): Promise<void> {
  const rows = (await db(tables.rateLimits).where(key).orderBy('id', 'asc')) as RateLimitRow[];
  const [kept, ...duplicates] = rows;

  if (!kept || duplicates.length === 0) {
    return;
  }

  await db(tables.rateLimits)
    .where('id', kept.id)
    .update({
      hits: rows.reduce((total, row) => total + Number(row.hits), 0),
      limit: Math.max(...rows.map((row) => Number(row.limit))),
      window_seconds: Math.max(...rows.map((row) => Number(row.window_seconds))),
      reset_at: maxIso(rows.map((row) => row.reset_at)),
      is_blocked: rows.some((row) => Boolean(row.is_blocked)),
      blocked_until: maxNullableIso(rows.map((row) => row.blocked_until)),
      updated_at: nowIso(),
    });

  await db(tables.rateLimits)
    .whereIn(
      'id',
      duplicates.map((row) => row.id),
    )
    .delete();
}

function maxIso(values: readonly string[]): string {
  return values.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest,
  );
}

function maxNullableIso(values: readonly (string | null)[]): string | null {
  const present = values.filter((value): value is string => value !== null);

  if (present.length === 0) {
    return null;
  }

  return maxIso(present);
}
