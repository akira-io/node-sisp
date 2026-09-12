const MAX_CAUSE_DEPTH = 5;

interface DatabaseErrorFields {
  code: string;
  errno: string;
  sqlState: string;
  message: string;
}

function fieldsOf(error: unknown): DatabaseErrorFields {
  const candidate = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
    sqlState?: unknown;
  };

  return {
    code: String(candidate?.code ?? ''),
    errno: String(candidate?.errno ?? ''),
    sqlState: String(candidate?.sqlState ?? ''),
    message: String(candidate?.message ?? '').toLowerCase(),
  };
}

function anyCause(error: unknown, matches: (fields: DatabaseErrorFields) => boolean): boolean {
  let current = error;

  for (
    let depth = 0;
    depth < MAX_CAUSE_DEPTH && current !== null && current !== undefined;
    depth += 1
  ) {
    if (matches(fieldsOf(current))) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return anyCause(error, matchesUniqueConstraint);
}

function matchesUniqueConstraint({ code, errno, sqlState, message }: DatabaseErrorFields): boolean {
  if (
    code === 'P2002' ||
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

  return false;
}

export function isIndexAlreadyExistsError(error: unknown): boolean {
  return anyCause(error, matchesIndexAlreadyExists);
}

function matchesIndexAlreadyExists({
  code,
  errno,
  sqlState,
  message,
}: DatabaseErrorFields): boolean {
  return (
    code === '42P07' ||
    sqlState === '42P07' ||
    code === 'ER_DUP_KEYNAME' ||
    errno === '1061' ||
    (sqlState === '42000' && message.includes('duplicate key name')) ||
    (code === 'SQLITE_ERROR' && message.includes('already exists'))
  );
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
