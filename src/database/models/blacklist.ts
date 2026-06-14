import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import { type BlacklistRecord, nowIso } from '../records';

export interface BlacklistEntry {
  type: string;
  value: string;
  severity?: string;
  reason?: string | null;
  notes?: string | null;
  addedBy?: string | null;
  expiresInMinutes?: number | null;
}

export class Blacklist {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
  ) {}

  async find(type: string, value: string): Promise<BlacklistRecord | null> {
    const row = await this.db(this.tables.blacklist)
      .where('type', type)
      .where('value', value)
      .where((query) => {
        query.whereNull('expires_at').orWhere('expires_at', '>', nowIso());
      })
      .first();

    return (row as BlacklistRecord | undefined) ?? null;
  }

  async isBlacklisted(type: string, value: string): Promise<boolean> {
    return (await this.find(type, value)) !== null;
  }

  async add(entry: BlacklistEntry): Promise<BlacklistRecord> {
    const timestamp = nowIso();

    await this.db(this.tables.blacklist).insert({
      type: entry.type,
      value: entry.value,
      severity: entry.severity ?? 'medium',
      reason: entry.reason ?? null,
      notes: entry.notes ?? null,
      added_by: entry.addedBy ?? null,
      expires_at: entry.expiresInMinutes
        ? new Date(Date.now() + entry.expiresInMinutes * 60_000).toISOString()
        : null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    const row = await this.db(this.tables.blacklist)
      .where('type', entry.type)
      .where('value', entry.value)
      .first();

    return row as BlacklistRecord;
  }

  async remove(type: string, value: string): Promise<boolean> {
    const deleted = await this.db(this.tables.blacklist)
      .where('type', type)
      .where('value', value)
      .delete();

    return deleted > 0;
  }
}
