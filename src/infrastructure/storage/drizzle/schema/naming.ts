import { createHash } from 'node:crypto';

export const MYSQL_IDENTIFIER_LIMIT = 64;

export function indexName(table: string, columns: readonly string[], limit?: number): string {
  return cap(`${table}_${columns.join('_')}_index`, limit);
}

export function uniqueName(table: string, columns: readonly string[], limit?: number): string {
  return cap(`${table}_${columns.join('_')}_unique`, limit);
}

function cap(name: string, limit: number | undefined): string {
  if (limit === undefined || name.length <= limit) {
    return name;
  }

  const digest = createHash('sha1').update(name).digest('hex').slice(0, 8);

  return `${name.slice(0, limit - digest.length - 1)}_${digest}`;
}
