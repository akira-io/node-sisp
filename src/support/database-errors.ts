export function isUniqueConstraintError(error: unknown): boolean {
  const candidate = error as { code?: unknown; errno?: unknown; message?: unknown };
  const code = String(candidate.code ?? '');
  const errno = String(candidate.errno ?? '');
  const message = String(candidate.message ?? '').toLowerCase();

  return (
    code === '23505' ||
    code === 'SQLITE_CONSTRAINT' ||
    errno === '1062' ||
    message.includes('unique') ||
    message.includes('duplicate')
  );
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
