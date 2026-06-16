export function isUniqueConstraintError(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
    sqlState?: unknown;
  };
  const code = String(candidate.code ?? '');
  const errno = String(candidate.errno ?? '');
  const sqlState = String(candidate.sqlState ?? '');
  const message = String(candidate.message ?? '').toLowerCase();

  if (
    code === '23505' ||
    sqlState === '23505' ||
    code === 'ER_DUP_ENTRY' ||
    errno === '1062' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    (code === 'SQLITE_CONSTRAINT' && message.includes('unique constraint failed'))
  ) {
    return true;
  }

  return message.includes('unique constraint') || message.includes('duplicate key');
}

export function isIndexAlreadyExistsError(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
    sqlState?: unknown;
  };
  const code = String(candidate.code ?? '');
  const errno = String(candidate.errno ?? '');
  const sqlState = String(candidate.sqlState ?? '');
  const message = String(candidate.message ?? '').toLowerCase();

  return (
    code === '42P07' ||
    sqlState === '42P07' ||
    code === 'ER_DUP_KEYNAME' ||
    errno === '1061' ||
    (sqlState === '42000' && message.includes('duplicate key name')) ||
    message.includes('already exists')
  );
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
