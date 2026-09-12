import { eq } from 'drizzle-orm';
import type { RequestMetadataRepository } from '../../../../core/contracts/storage';
import type { RequestMetadataRecord } from '../../../../domain/records';
import type {
  ListByTransactionOptions,
  NewRequestMetadata,
} from '../../../../domain/storage-types';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { nowIso } from '../../knex/records';
import { normalizeRow } from '../mapping';
import type { RepositoryContext } from './context';
import { gateway } from './context';

export function makeRequestMetadataRepository(
  context: RepositoryContext,
): RequestMetadataRepository {
  const rows = () => gateway(context, 'requestMetadata');

  return {
    async create(data: NewRequestMetadata): Promise<void> {
      const timestamp = nowIso();

      await rows().insert({
        ...data,
        custom_metadata: context.cipher.store(data.custom_metadata ?? null),
        created_at: timestamp,
        updated_at: timestamp,
      });
    },

    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<RequestMetadataRecord[]> {
      const table = rows();
      const found = await table.all(eq(table.column('transaction_id'), transactionId), {
        orderBy: [table.ordered('id', normalizeListOrder(options.order))],
        limit: normalizeListLimit(options.limit),
        offset: normalizeListOffset(options.offset),
      });

      return found.map((row) => {
        const normalized = normalizeRow('requestMetadata', row);

        return {
          ...(normalized as unknown as RequestMetadataRecord),
          custom_metadata: context.cipher.read(normalized.custom_metadata),
        };
      });
    },
  };
}
