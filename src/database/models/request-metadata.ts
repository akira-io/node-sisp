import type { Knex } from 'knex';
import type { SispTables } from '../../config';
import { nowIso, type RequestMetadataRecord } from '../records';

export type NewRequestMetadata = Omit<
  Partial<RequestMetadataRecord>,
  'id' | 'created_at' | 'updated_at'
> &
  Pick<RequestMetadataRecord, 'ip_address'>;

export class RequestMetadata {
  constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
  ) {}

  async create(data: NewRequestMetadata): Promise<void> {
    const timestamp = nowIso();

    await this.db(this.tables.requestMetadata).insert({
      ...data,
      custom_metadata:
        data.custom_metadata === undefined ? null : JSON.stringify(data.custom_metadata),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  async listByTransaction(transactionId: number): Promise<RequestMetadataRecord[]> {
    const rows = await this.db(this.tables.requestMetadata)
      .where('transaction_id', transactionId)
      .orderBy('id');

    return rows.map((row: Record<string, unknown>) => ({
      ...(row as unknown as RequestMetadataRecord),
      is_vpn: Boolean(row.is_vpn),
      is_proxy: Boolean(row.is_proxy),
      is_mobile: Boolean(row.is_mobile),
      custom_metadata:
        typeof row.custom_metadata === 'string'
          ? JSON.parse(row.custom_metadata)
          : row.custom_metadata,
    }));
  }
}
