import type { PrismaSqlProvider } from './prisma-storage';

export type RawExec = (query: string, ...values: unknown[]) => Promise<unknown>;

export async function lockRowForUpdate(
  exec: RawExec,
  provider: PrismaSqlProvider,
  table: string,
  column: string,
  value: unknown,
): Promise<void> {
  if (provider === 'sqlite') {
    return;
  }

  const quotedTable = quoteIdentifier(table, provider);
  const quotedColumn = quoteIdentifier(column, provider);

  await exec(
    `SELECT ${quotedColumn} FROM ${quotedTable} WHERE ${quotedColumn} = ? FOR UPDATE`,
    value,
  );
}

function quoteIdentifier(identifier: string, provider: PrismaSqlProvider): string {
  if (provider === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}
