import { toCents } from '../../../../support/sisp-amount';

export function extractId(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return Number((value as { id: unknown }).id);
  }

  return Number(value);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}

export function amountCentsFromRow(row: Record<string, unknown>): number {
  const amountCents = Number(row.amount_cents);

  if (row.amount_cents !== null && row.amount_cents !== undefined && Number.isFinite(amountCents)) {
    return amountCents;
  }

  if (typeof row.amount === 'number' || typeof row.amount === 'string') {
    return toCents(row.amount);
  }

  return 0;
}
