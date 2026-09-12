import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { BlacklistRepository } from '../../../../core/contracts/storage';
import type { BlacklistRecord } from '../../../../domain/records';
import type { BlacklistEntry } from '../../../../domain/storage-types';
import { nowIso } from '../../knex/records';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

export function makeBlacklistRepository(context: RepositoryContext): BlacklistRepository {
  const rows = () => gateway(context, 'blacklist');

  async function find(type: string, value: string): Promise<BlacklistRecord | null> {
    const table = rows();
    const row = await table.first(
      and(
        eq(table.column('type'), type),
        eq(table.column('value'), value),
        or(
          isNull(table.column('expires_at')),
          gt(table.column('expires_at'), table.timestampValue(nowIso())),
        ),
      ),
    );

    return row ? (normalizeRow('blacklist', row) as unknown as BlacklistRecord) : null;
  }

  return {
    find,

    async isBlacklisted(type: string, value: string): Promise<boolean> {
      return (await find(type, value)) !== null;
    },

    async add(entry: BlacklistEntry): Promise<BlacklistRecord> {
      const table = rows();
      const timestamp = nowIso();

      await table.insert({
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

      const row = await table.first(
        and(eq(table.column('type'), entry.type), eq(table.column('value'), entry.value)),
      );

      if (row === null) {
        throw new Error(`Blacklist entry ${entry.type}:${entry.value} not found after insert.`);
      }

      return normalizeRow('blacklist', row) as unknown as BlacklistRecord;
    },

    async remove(type: string, value: string): Promise<boolean> {
      const table = rows();
      const deleted = await table.delete(
        and(eq(table.column('type'), type), eq(table.column('value'), value)),
      );

      return deleted > 0;
    },
  };
}
