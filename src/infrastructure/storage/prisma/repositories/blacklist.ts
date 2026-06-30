import type { SispTables } from '../../../../application/config';
import type { BlacklistRepository } from '../../../../core/contracts/storage';
import type { BlacklistRecord } from '../../../../domain/records';
import type { BlacklistEntry } from '../../../../domain/storage-types';
import { nowIso } from '../../knex/records';
import { DELEGATE_NAMES, delegate, type PrismaClientLike } from '../client';
import { mapBlacklist } from '../mapping';

export function makeBlacklistRepository(
  client: PrismaClientLike,
  _tables: SispTables,
): BlacklistRepository {
  const model = () => delegate(client, DELEGATE_NAMES.blacklist);

  return {
    async find(type: string, value: string): Promise<BlacklistRecord | null> {
      const now = new Date(nowIso());

      const row = await model().findFirst({
        where: {
          type,
          value,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
      });

      return row ? mapBlacklist(row) : null;
    },

    async isBlacklisted(type: string, value: string): Promise<boolean> {
      return (await this.find(type, value)) !== null;
    },

    async add(entry: BlacklistEntry): Promise<BlacklistRecord> {
      const timestamp = nowIso();
      const expiresAt = entry.expiresInMinutes
        ? new Date(Date.now() + entry.expiresInMinutes * 60_000)
        : null;

      await model().create({
        data: {
          type: entry.type,
          value: entry.value,
          severity: entry.severity ?? 'medium',
          reason: entry.reason ?? null,
          notes: entry.notes ?? null,
          addedBy: entry.addedBy ?? null,
          expiresAt,
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
        },
      });

      const row = await model().findFirst({
        where: { type: entry.type, value: entry.value },
      });

      if (!row) {
        throw new Error(`Blacklist entry for ${entry.type}/${entry.value} not found after insert.`);
      }

      return mapBlacklist(row);
    },

    async remove(type: string, value: string): Promise<boolean> {
      const result = await model().deleteMany({
        where: { type, value },
      });

      return result.count > 0;
    },
  };
}
