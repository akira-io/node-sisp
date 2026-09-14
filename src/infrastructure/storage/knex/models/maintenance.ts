import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import type {
  MaintenanceRepository,
  ReencryptResult,
  ReencryptSpec,
} from '../../../../core/contracts/maintenance';
import type { LockedRow, ReencryptDriver, RowVisit } from '../../reencrypt-batch';
import { reencryptBatch } from '../../reencrypt-batch';
import { knexColumnCodec } from '../column-codecs';
import type { PayloadCipher } from '../encryption';
import { lockForUpdate } from '../locking';

export class Maintenance implements MaintenanceRepository, ReencryptDriver<number> {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
    readonly cipher: PayloadCipher,
  ) {}

  withConnection(connection: Knex): Maintenance {
    return new Maintenance(connection, this.tables, this.cipher);
  }

  async reencryptBatch(spec: ReencryptSpec): Promise<ReencryptResult> {
    return reencryptBatch(spec, this);
  }

  async candidateIds(spec: ReencryptSpec): Promise<number[]> {
    const rows = (await this.db(this.tables[spec.table])
      .where('id', '>', spec.afterId)
      .orderBy('id', 'asc')
      .limit(spec.limit)
      .select('id')) as { id: number | string }[];

    return rows.map((row) => Number(row.id));
  }

  rowId(id: number): number {
    return id;
  }

  async withLockedRow(
    spec: ReencryptSpec,
    id: number,
    visit: (row: LockedRow | null) => Promise<RowVisit>,
  ): Promise<RowVisit> {
    const table = this.tables[spec.table];

    return this.db.transaction(async (trx): Promise<RowVisit> => {
      const row = (await lockForUpdate(this.db, trx(table).where('id', id)).first()) as
        | Record<string, unknown>
        | undefined;

      if (row === undefined) {
        return visit(null);
      }

      return visit({
        read: (column) => knexColumnCodec(spec.table, column.name).decode(row[column.name]),
        write: async (changes) => {
          const values: Record<string, unknown> = {};

          for (const { column, value } of changes) {
            values[column.name] = knexColumnCodec(spec.table, column.name).encode(value);
          }

          await trx(table).where('id', id).update(values);
        },
      });
    });
  }
}
