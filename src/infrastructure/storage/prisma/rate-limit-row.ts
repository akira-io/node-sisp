import type { PrismaRow } from './mapping';

export interface RateLimitRow {
  id: bigint | number;
  hits: number;
  limit: number;
  windowSeconds: number;
  resetAt: Date | string;
  isBlocked: boolean | number;
  blockedUntil: Date | string | null;
}

export function mapRateLimitRow(row: PrismaRow): RateLimitRow {
  return {
    id: row.id as bigint | number,
    hits: Number(row.hits),
    limit: Number(row.limit),
    windowSeconds: Number(row.window_seconds),
    resetAt: row.reset_at as Date | string,
    isBlocked: row.is_blocked as boolean | number,
    blockedUntil: (row.blocked_until as Date | string | null) ?? null,
  };
}
