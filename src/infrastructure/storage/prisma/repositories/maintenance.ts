import type { SispTables } from '../../../../application/config';
import type {
  MaintenanceRepository,
  ReencryptResult,
  ReencryptSpec,
} from '../../../../core/contracts/maintenance';
import type { PayloadCipher } from '../../knex/encryption';
import type { LockedRow, ReencryptDriver, RowVisit } from '../../reencrypt-batch';
import { reencryptBatch } from '../../reencrypt-batch';
import {
  DELEGATE_NAMES,
  delegate,
  type PrismaClientLike,
  type PrismaTransactionOptions,
  rawExec,
  runInTransaction,
} from '../client';
import { prismaRawSqlCodec } from '../column-codecs';
import { selectForUpdate } from '../locking';
import type { PrismaSqlProvider } from '../prisma-storage';

export const PRISMA_ENCRYPTED_FIELDS: Record<string, string> = {
  payload: 'payload',
  callback_payload: 'callbackPayload',
  old_values: 'oldValues',
  new_values: 'newValues',
  custom_metadata: 'customMetadata',
};

function field(column: string): string {
  const mapped = PRISMA_ENCRYPTED_FIELDS[column];

  if (mapped === undefined) {
    throw new Error(`No Prisma field is mapped for the encrypted column ${column}.`);
  }

  return mapped;
}

export function makeMaintenanceRepository(
  client: PrismaClientLike,
  tables: SispTables,
  cipher: PayloadCipher,
  provider: PrismaSqlProvider,
  txOptions?: PrismaTransactionOptions,
): MaintenanceRepository {
  const driver: ReencryptDriver<bigint> = {
    cipher,

    async candidateIds(spec: ReencryptSpec): Promise<bigint[]> {
      const rows = await delegate(client, DELEGATE_NAMES[spec.table]).findMany({
        where: { id: { gt: BigInt(spec.afterId) } },
        orderBy: { id: 'asc' },
        take: spec.limit,
        select: { id: true },
      });

      return rows.map((row) => row.id as bigint);
    },

    rowId(id: bigint): number {
      return Number(id);
    },

    async withLockedRow(
      spec: ReencryptSpec,
      id: bigint,
      visit: (row: LockedRow | null) => Promise<RowVisit>,
    ): Promise<RowVisit> {
      return runInTransaction(
        client,
        async (txc): Promise<RowVisit> => {
          const [locked] = await selectForUpdate(rawExec(txc), provider, tables[spec.table], [
            { column: 'id', value: id },
          ]);

          if (locked === undefined) {
            return visit(null);
          }

          return visit({
            read: (column) =>
              prismaRawSqlCodec(spec.table, column.name).decode(locked[column.name]),
            write: async (changes) => {
              const data: Record<string, unknown> = {};

              for (const { column, value } of changes) {
                data[field(column.name)] = value;
              }

              await delegate(txc, DELEGATE_NAMES[spec.table]).update({ where: { id }, data });
            },
          });
        },
        txOptions,
      );
    },
  };

  return {
    async reencryptBatch(spec: ReencryptSpec): Promise<ReencryptResult> {
      return reencryptBatch(spec, driver);
    },
  };
}
