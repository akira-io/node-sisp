import type { StoredJsonType } from './contract';

const SQLITE_TYPES: Record<string, StoredJsonType> = {
  object: 'object',
  array: 'array',
  text: 'string',
  integer: 'number',
  real: 'number',
  true: 'boolean',
  false: 'boolean',
  null: 'json-null',
};

export function sqliteStoredJsonType(
  read: (sql: string, ...values: unknown[]) => Record<string, unknown> | undefined,
  table: string,
  column: string,
  id: number,
): StoredJsonType {
  const row = read(`SELECT json_type("${column}") AS json_type FROM "${table}" WHERE "id" = ?`, id);

  if (row === undefined) {
    throw new Error(`No row ${id} in ${table}.`);
  }

  if (row.json_type === null || row.json_type === undefined) {
    return 'sql-null';
  }

  const type = String(row.json_type).toLowerCase();
  const mapped = SQLITE_TYPES[type];

  if (mapped === undefined) {
    throw new Error(`Unknown sqlite json_type ${type} for ${table}.${column}.`);
  }

  return mapped;
}

const POSTGRES_TYPES: Record<string, StoredJsonType> = {
  object: 'object',
  array: 'array',
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  null: 'json-null',
};

export async function postgresStoredJsonType(
  read: (sql: string, values: unknown[]) => Promise<Record<string, unknown> | undefined>,
  table: string,
  column: string,
  id: number,
): Promise<StoredJsonType> {
  const row = await read(
    `SELECT json_typeof("${column}") AS json_type FROM "${table}" WHERE "id" = $1`,
    [id],
  );

  if (row === undefined) {
    throw new Error(`No row ${id} in ${table}.`);
  }

  if (row.json_type === null || row.json_type === undefined) {
    return 'sql-null';
  }

  const type = String(row.json_type).toLowerCase();
  const mapped = POSTGRES_TYPES[type];

  if (mapped === undefined) {
    throw new Error(`Unknown postgres json_typeof ${type} for ${table}.${column}.`);
  }

  return mapped;
}
