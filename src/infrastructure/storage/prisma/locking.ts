import type { PrismaSqlProvider } from './prisma-storage';

export type RawExec = (query: string, ...values: unknown[]) => Promise<unknown>;

export interface LockColumn {
  column: string;
  value: unknown;
}

export async function lockRowForUpdate(
  exec: RawExec,
  provider: PrismaSqlProvider,
  table: string,
  column: string,
  value: unknown,
): Promise<void>;
export async function lockRowForUpdate(
  exec: RawExec,
  provider: PrismaSqlProvider,
  table: string,
  columns: LockColumn[],
): Promise<void>;
export async function lockRowForUpdate(
  exec: RawExec,
  provider: PrismaSqlProvider,
  table: string,
  columnOrColumns: string | LockColumn[],
  value?: unknown,
): Promise<void> {
  if (provider === 'sqlite') {
    return;
  }

  const columns: LockColumn[] = Array.isArray(columnOrColumns)
    ? columnOrColumns
    : [{ column: columnOrColumns, value }];

  const [first] = columns;

  if (!first) {
    return;
  }

  const quotedTable = quoteIdentifier(table, provider);
  const firstColumn = quoteIdentifier(first.column, provider);
  const { where, values } = buildWhere(columns, provider);

  await exec(`SELECT ${firstColumn} FROM ${quotedTable} WHERE ${where} FOR UPDATE`, ...values);
}

export async function selectForUpdate(
  exec: RawExec,
  provider: PrismaSqlProvider,
  table: string,
  columns: LockColumn[],
): Promise<Record<string, unknown>[]> {
  if (columns.length === 0) {
    return [];
  }

  const { where, values } = buildWhere(columns, provider);
  const locking = provider === 'sqlite' ? '' : ' FOR UPDATE';
  const result = await exec(
    `SELECT * FROM ${quoteIdentifier(table, provider)} WHERE ${where}${locking}`,
    ...values,
  );

  return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
}

function buildWhere(
  columns: LockColumn[],
  provider: PrismaSqlProvider,
): { where: string; values: unknown[] } {
  const where = columns
    .map(
      ({ column }, index) =>
        `${quoteIdentifier(column, provider)} = ${placeholder(provider, index)}`,
    )
    .join(' AND ');

  return { where, values: columns.map(({ value }) => value) };
}

function placeholder(provider: PrismaSqlProvider, index: number): string {
  return provider === 'postgresql' ? `$${index + 1}` : '?';
}

function quoteIdentifier(identifier: string, provider: PrismaSqlProvider): string {
  if (provider === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}
