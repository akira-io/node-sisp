import { eq, gt } from 'drizzle-orm';
import type {
  MaintenanceRepository,
  ReencryptResult,
  ReencryptSpec,
} from '../../../../core/contracts/maintenance';
import type { LockedRow, ReencryptDriver, RowVisit } from '../../reencrypt-batch';
import { reencryptBatch } from '../../reencrypt-batch';
import type { DrizzleRow } from '../client';
import { runInTransaction } from '../client';
import { drizzleColumnCodec } from '../column-codecs';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway, scopedContext } from './context';

export function makeMaintenanceRepository(context: RepositoryContext): MaintenanceRepository {
  const driver: ReencryptDriver<number> = {
    cipher: context.cipher,

    async candidateIds(spec: ReencryptSpec): Promise<number[]> {
      const table = gateway(context, spec.table);

      return table.ids(gt(table.column('id'), spec.afterId), {
        orderBy: [table.ascending('id')],
        limit: spec.limit,
      });
    },

    rowId(id: number): number {
      return id;
    },

    async withLockedRow(
      spec: ReencryptSpec,
      id: number,
      visit: (row: LockedRow | null) => Promise<RowVisit>,
    ): Promise<RowVisit> {
      return runInTransaction(context.connection, async (connection): Promise<RowVisit> => {
        const table = gateway(scopedContext(context, connection), spec.table);
        const locked = await table.firstForUpdate(eq(table.column('id'), id));

        if (locked === null) {
          return visit(null);
        }

        const normalized = normalizeRow(spec.table, locked);

        return visit({
          read: (column) =>
            drizzleColumnCodec(spec.table, column.name).decode(normalized[column.name]),
          write: async (changes) => {
            const values: DrizzleRow = {};

            for (const { column, value } of changes) {
              values[column.name] = drizzleColumnCodec(spec.table, column.name).encode(value);
            }

            await table.update(eq(table.column('id'), id), values);
          },
        });
      });
    },
  };

  return {
    async reencryptBatch(spec: ReencryptSpec): Promise<ReencryptResult> {
      return reencryptBatch(spec, driver);
    },
  };
}
