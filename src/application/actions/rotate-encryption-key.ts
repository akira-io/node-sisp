import {
  ENCRYPTED_COLUMNS,
  type EncryptedTableKey,
  type ReencryptFailure,
} from '../../core/contracts/maintenance';
import type { SispStorage } from '../../core/contracts/storage';
import type { ReencryptCounts } from '../../infrastructure/storage/reencrypt-batch';
import { emptyCounts, mergeCounts } from '../../infrastructure/storage/reencrypt-batch';
import { resolveBatch } from '../options';

export interface RotateEncryptionKeyOptions {
  batch?: number;
}

export interface RotateEncryptionKeyFailure extends ReencryptFailure {
  table: EncryptedTableKey;
}

export interface RotateEncryptionKeyResult extends ReencryptCounts {
  unreadableValues: readonly RotateEncryptionKeyFailure[];
  unreadableValueCount: number;
  stoppedEarly: boolean;
  stoppedAtTable: EncryptedTableKey | null;
}

const DEFAULT_ROTATE_BATCH = 200;
const REPORTED_FAILURES = 50;
const ABORT_AFTER_UNREADABLE = 500;

export class RotateEncryptionKeyAction {
  constructor(private readonly storage: SispStorage) {}

  async handle(options: RotateEncryptionKeyOptions = {}): Promise<RotateEncryptionKeyResult> {
    const limit = resolveBatch(options.batch, DEFAULT_ROTATE_BATCH, 'rotateEncryptionKey');
    const unreadableValues: RotateEncryptionKeyFailure[] = [];
    let unreadableValueCount = 0;
    let counts = emptyCounts();

    for (const { table, columns } of ENCRYPTED_COLUMNS) {
      let afterId = 0;
      let tableCounts = emptyCounts();

      for (;;) {
        const batch = await this.storage.maintenance.reencryptBatch({
          table,
          columns,
          afterId,
          limit,
        });

        counts = mergeCounts(counts, batch);
        tableCounts = mergeCounts(tableCounts, batch);
        unreadableValueCount += batch.unreadableValues.length;

        for (const failure of batch.unreadableValues) {
          if (unreadableValues.length < REPORTED_FAILURES) {
            unreadableValues.push({ ...failure, table });
          }
        }

        if (hopeless(tableCounts)) {
          return {
            ...counts,
            unreadableValues,
            unreadableValueCount,
            stoppedEarly: true,
            stoppedAtTable: table,
          };
        }

        if (batch.lastId === null || batch.processed < limit) {
          break;
        }

        afterId = batch.lastId;
      }
    }

    return {
      ...counts,
      unreadableValues,
      unreadableValueCount,
      stoppedEarly: false,
      stoppedAtTable: null,
    };
  }
}

function hopeless(counts: ReencryptCounts): boolean {
  return (
    counts.unreadable >= ABORT_AFTER_UNREADABLE && counts.rewritten === 0 && counts.current === 0
  );
}
