import type {
  EncryptedColumn,
  ReencryptFailure,
  ReencryptResult,
  ReencryptSpec,
} from '../../core/contracts/maintenance';
import type { PayloadCipher } from './knex/encryption';
import type { RekeyChange, RekeyFailure, RowRekey } from './rekey';
import { rekeyRow } from './rekey';

export type ReencryptCounts = Omit<ReencryptResult, 'unreadableValues' | 'lastId'>;

export type RowVisit =
  | {
      status: 'rewritten' | 'current' | 'plaintext' | 'unreadable';
      failures: readonly RekeyFailure[];
    }
  | { status: 'vanished' };

export interface LockedRow {
  read(column: EncryptedColumn): unknown;
  write(changes: readonly RekeyChange[]): Promise<void>;
}

export interface ReencryptDriver<Id> {
  readonly cipher: PayloadCipher;
  candidateIds(spec: ReencryptSpec): Promise<readonly Id[]>;
  rowId(id: Id): number;
  withLockedRow(
    spec: ReencryptSpec,
    id: Id,
    visit: (row: LockedRow | null) => Promise<RowVisit>,
  ): Promise<RowVisit>;
}

const VANISHED: RowVisit = { status: 'vanished' };

export function emptyCounts(): ReencryptCounts {
  return {
    processed: 0,
    rewritten: 0,
    current: 0,
    plaintext: 0,
    unreadable: 0,
    vanished: 0,
  };
}

export function mergeCounts(into: ReencryptCounts, from: ReencryptCounts): ReencryptCounts {
  return {
    processed: into.processed + from.processed,
    rewritten: into.rewritten + from.rewritten,
    current: into.current + from.current,
    plaintext: into.plaintext + from.plaintext,
    unreadable: into.unreadable + from.unreadable,
    vanished: into.vanished + from.vanished,
  };
}

export async function reencryptBatch<Id>(
  spec: ReencryptSpec,
  driver: ReencryptDriver<Id>,
): Promise<ReencryptResult> {
  const tally = new ReencryptTally();

  for (const id of await driver.candidateIds(spec)) {
    tally.visit(driver.rowId(id), await visitRow(spec, id, driver));
  }

  return tally.result();
}

function visitRow<Id>(spec: ReencryptSpec, id: Id, driver: ReencryptDriver<Id>): Promise<RowVisit> {
  return driver.withLockedRow(spec, id, async (row) => {
    if (row === null) {
      return VANISHED;
    }

    const rekey = rekeyRow(driver.cipher, spec.columns, (column) => row.read(column));

    if (rekey.changes.length === 0) {
      return unchangedRow(rekey);
    }

    await row.write(rekey.changes);

    return { status: 'rewritten', failures: rekey.failures };
  });
}

function unchangedRow(rekey: RowRekey): RowVisit {
  if (rekey.failures.length > 0) {
    return { status: 'unreadable', failures: rekey.failures };
  }

  if (rekey.plaintext > 0) {
    return { status: 'plaintext', failures: rekey.failures };
  }

  return { status: 'current', failures: rekey.failures };
}

class ReencryptTally {
  private lastId: number | null = null;
  private counts = emptyCounts();
  private readonly unreadableValues: ReencryptFailure[] = [];

  visit(id: number, outcome: RowVisit): void {
    this.counts.processed += 1;
    this.counts[outcome.status] += 1;
    this.lastId = id;

    if (outcome.status === 'vanished') {
      return;
    }

    for (const failure of outcome.failures) {
      this.unreadableValues.push({ id, ...failure });
    }
  }

  result(): ReencryptResult {
    return {
      ...this.counts,
      unreadableValues: this.unreadableValues,
      lastId: this.lastId,
    };
  }
}
