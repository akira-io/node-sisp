import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import { nowIso } from '../records';

export interface RateLimitHit {
  identifier: string;
  limitType: string;
  context?: string | null;
  limit: number;
  windowSeconds: number;
}

interface RateLimitRow {
  id: number;
  hits: number;
  limit: number;
  window_seconds: number;
  reset_at: string;
  is_blocked: boolean | number;
  blocked_until: string | null;
}

export class RateLimitRepository {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
  ) {}

  async hit(params: RateLimitHit): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const row = await this.findOrCreate(trx, params);
      const resetRow = await this.resetIfExpired(trx, row, params);

      if (this.isCurrentlyBlocked(resetRow)) {
        return true;
      }

      const hits = resetRow.hits + 1;

      await trx(this.tables.rateLimits).where('id', resetRow.id).update({
        hits,
        updated_at: nowIso(),
      });

      if (hits > params.limit) {
        await this.block(trx, resetRow.id, params.windowSeconds);

        return true;
      }

      return false;
    });
  }

  private async findOrCreate(trx: Knex.Transaction, params: RateLimitHit): Promise<RateLimitRow> {
    const filter = {
      identifier: params.identifier,
      limit_type: params.limitType,
      context: params.context ?? null,
    };

    const existing = await trx(this.tables.rateLimits).where(filter).forUpdate().first();

    if (existing) {
      return existing as RateLimitRow;
    }

    const timestamp = nowIso();

    await trx(this.tables.rateLimits).insert({
      ...filter,
      hits: 0,
      limit: params.limit,
      window_seconds: params.windowSeconds,
      reset_at: futureIso(params.windowSeconds),
      is_blocked: false,
      created_at: timestamp,
      updated_at: timestamp,
    });

    return (await trx(this.tables.rateLimits).where(filter).first()) as RateLimitRow;
  }

  private async resetIfExpired(
    trx: Knex.Transaction,
    row: RateLimitRow,
    params: RateLimitHit,
  ): Promise<RateLimitRow> {
    if (Date.parse(row.reset_at) > Date.now()) {
      return row;
    }

    const reset = {
      hits: 0,
      reset_at: futureIso(params.windowSeconds),
      is_blocked: false,
      blocked_until: null,
    };

    await trx(this.tables.rateLimits)
      .where('id', row.id)
      .update({ ...reset, updated_at: nowIso() });

    return { ...row, ...reset };
  }

  private isCurrentlyBlocked(row: RateLimitRow): boolean {
    if (!row.is_blocked) {
      return false;
    }

    return row.blocked_until === null || Date.parse(row.blocked_until) > Date.now();
  }

  private async block(trx: Knex.Transaction, id: number, windowSeconds: number): Promise<void> {
    await trx(this.tables.rateLimits).where('id', id).update({
      is_blocked: true,
      blocked_until: futureIso(windowSeconds),
      updated_at: nowIso(),
    });
  }
}

function futureIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
