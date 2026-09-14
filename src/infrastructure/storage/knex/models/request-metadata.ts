import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import type { NewRequestMetadata } from '../../../../domain/storage-types';
import { knexColumnCodec } from '../column-codecs';
import type { PayloadCipher } from '../encryption';
import {
  type ListByTransactionOptions,
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../list-options';
import { nowIso, type RequestMetadataRecord, timestampValue } from '../records';

export type { NewRequestMetadata } from '../../../../domain/storage-types';

const CODEC = knexColumnCodec('requestMetadata', 'custom_metadata');

export class RequestMetadata {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
    private readonly cipher: PayloadCipher,
  ) {}

  withConnection(connection: Knex): RequestMetadata {
    return new RequestMetadata(connection, this.tables, this.cipher);
  }

  async create(data: NewRequestMetadata): Promise<void> {
    const timestamp = nowIso();

    await this.db(this.tables.requestMetadata).insert({
      ...data,
      custom_metadata: CODEC.encode(this.cipher.store(data.custom_metadata ?? null)),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  async listByTransaction(
    transactionId: number,
    options: ListByTransactionOptions = {},
  ): Promise<RequestMetadataRecord[]> {
    const rows = await this.db(this.tables.requestMetadata)
      .where('transaction_id', transactionId)
      .orderBy('id', normalizeListOrder(options.order))
      .limit(normalizeListLimit(options.limit))
      .offset(normalizeListOffset(options.offset));

    return rows.map((row: Record<string, unknown>) => ({
      ...(row as unknown as RequestMetadataRecord),
      is_vpn: Boolean(row.is_vpn),
      is_proxy: Boolean(row.is_proxy),
      is_mobile: Boolean(row.is_mobile),
      custom_metadata: this.cipher.read(CODEC.decode(row.custom_metadata)),
    }));
  }

  async purgeOlderThan(cutoffIso: string, limit: number): Promise<number> {
    const stale = await this.db(this.tables.requestMetadata)
      .select('id')
      .where('created_at', '<', timestampValue(this.db, cutoffIso))
      .orderBy('id', 'asc')
      .limit(limit);
    const ids = stale.map((row: Record<string, unknown>) => Number(row.id));

    if (ids.length === 0) {
      return 0;
    }

    return this.db(this.tables.requestMetadata).whereIn('id', ids).delete();
  }

  async countOlderThan(cutoffIso: string): Promise<number> {
    const [row] = await this.db(this.tables.requestMetadata)
      .where('created_at', '<', timestampValue(this.db, cutoffIso))
      .count<{ count: string | number }[]>({ count: '*' });

    return Number(row?.count ?? 0);
  }
}
