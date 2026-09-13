import {
  ENCRYPTED_COLUMNS,
  type EncryptedTableKey,
  type ReencryptFailure,
} from '../../core/contracts/maintenance';
import type { SispStorage } from '../../core/contracts/storage';
import { SispError } from '../../domain/errors/exceptions';
import type { ReencryptCounts } from '../../infrastructure/storage/reencrypt-batch';
import { emptyCounts, mergeCounts } from '../../infrastructure/storage/reencrypt-batch';

export interface RotateEncryptionKeyOptions {
  batch?: number;
}

export interface RotateEncryptionKeyFailure extends ReencryptFailure {
  table: EncryptedTableKey;
}

export interface RotateEncryptionKeyResult extends ReencryptCounts {
  unreadableValues: readonly RotateEncryptionKeyFailure[];
}

const DEFAULT_ROTATE_BATCH = 200;

export class RotateEncryptionKeyAction {
  constructor(private readonly storage: SispStorage) {}

  async handle(options: RotateEncryptionKeyOptions = {}): Promise<RotateEncryptionKeyResult> {
    const limit = batchSize(options.batch);
    const unreadableValues: RotateEncryptionKeyFailure[] = [];
    let counts = emptyCounts();

    for (const { table, columns } of ENCRYPTED_COLUMNS) {
      let afterId = 0;

      for (;;) {
        const batch = await this.storage.maintenance.reencryptBatch({
          table,
          columns,
          afterId,
          limit,
        });

        counts = mergeCounts(counts, batch);

        for (const failure of batch.unreadableValues) {
          unreadableValues.push({ ...failure, table });
        }

        if (batch.lastId === null || batch.processed < limit) {
          break;
        }

        afterId = batch.lastId;
      }
    }

    return { ...counts, unreadableValues };
  }
}

function batchSize(batch: number | undefined): number {
  if (batch === undefined) {
    return DEFAULT_ROTATE_BATCH;
  }

  if (!Number.isInteger(batch) || batch < 1) {
    throw new SispError(
      `rotateEncryptionKey expects batch to be a positive integer, received ${batch}.`,
    );
  }

  return batch;
}
