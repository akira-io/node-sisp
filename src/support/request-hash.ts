import { createHash } from 'node:crypto';

export function paymentRequestHash(
  body: Record<string, unknown>,
  excludedKeys: readonly string[],
): string {
  const entries = Object.entries(body).filter(([key]) => !excludedKeys.includes(key));

  return createHash('sha256')
    .update(canonicalize(Object.fromEntries(entries)), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const pairs = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);

    return `{${pairs.join(',')}}`;
  }

  if (typeof value === 'number') {
    return JSON.stringify(String(value));
  }

  return JSON.stringify(value) ?? 'null';
}
