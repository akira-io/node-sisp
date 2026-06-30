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
  const where = columns
    .map(
      ({ column }, index) =>
        `${quoteIdentifier(column, provider)} = ${placeholder(provider, index)}`,
    )
    .join(' AND ');

  await exec(
    `SELECT ${firstColumn} FROM ${quotedTable} WHERE ${where} FOR UPDATE`,
    ...columns.map(({ value }) => value),
  );
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
