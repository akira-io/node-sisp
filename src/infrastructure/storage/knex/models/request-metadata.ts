import type { Knex } from 'knex';
import type { SispTables } from '../../../../application/config';
import type { NewRequestMetadata } from '../../../../domain/storage-types';
import type { PayloadCipher } from '../encryption';
import {
  type ListByTransactionOptions,
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../list-options';
import { nowIso, type RequestMetadataRecord } from '../records';

export type { NewRequestMetadata } from '../../../../domain/storage-types';

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
      custom_metadata: encodeJsonColumn(this.cipher.store(data.custom_metadata ?? null)),
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
      custom_metadata: this.cipher.read(decodeJsonColumn(row.custom_metadata)),
    }));
  }
}

function encodeJsonColumn(value: string | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function decodeJsonColumn(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
