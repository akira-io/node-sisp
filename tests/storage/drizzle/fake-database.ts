import type { DrizzleDatabase, DrizzleRow } from '../../../src/infrastructure/storage/drizzle';

export interface Recorder {
  calls: string[];
  inserted: DrizzleRow[];
  updated: DrizzleRow[];
}

export interface FakeOptions {
  insertResult?: unknown;
  supportsReturning?: boolean;
  supportsOnConflict?: boolean;
  supportsOnDuplicateKey?: boolean;
  supportsFor?: boolean;
  supportsTransaction?: boolean;
  runner?: 'run' | 'execute' | 'none';
  rows?: DrizzleRow[];
}

export function fakeDatabase(options: FakeOptions = {}): {
  db: DrizzleDatabase;
  recorder: Recorder;
} {
  const recorder: Recorder = { calls: [], inserted: [], updated: [] };
  const rows = options.rows ?? [];

  const selectBuilder = (): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      from: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable, and this fake stands in for one
      then: (resolve: (value: DrizzleRow[]) => unknown) => resolve(rows),
    };

    if (options.supportsFor === true) {
      builder.for = (strength: string) => {
        recorder.calls.push(`for:${strength}`);

        return builder;
      };
    }

    return builder;
  };

  const insertBuilder = (): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      values: (values: DrizzleRow | DrizzleRow[]) => {
        recorder.inserted.push(...(Array.isArray(values) ? values : [values]));

        return builder;
      },
      // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable, and this fake stands in for one
      then: (resolve: (value: unknown) => unknown) => resolve(options.insertResult),
    };

    if (options.supportsReturning === true) {
      builder.returning = () => Promise.resolve(rows);
    }

    if (options.supportsOnConflict === true) {
      builder.onConflictDoNothing = () => {
        recorder.calls.push('onConflictDoNothing');

        return builder;
      };
    }

    if (options.supportsOnDuplicateKey === true) {
      builder.onDuplicateKeyUpdate = () => {
        recorder.calls.push('onDuplicateKeyUpdate');

        return builder;
      };
    }

    return builder;
  };

  const db: Record<string, unknown> = {
    select: selectBuilder,
    insert: insertBuilder,
    update: () => {
      const builder: Record<string, unknown> = {
        set: (values: DrizzleRow) => {
          recorder.updated.push(values);

          return builder;
        },
        where: () => builder,
        // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable, and this fake stands in for one
        then: (resolve: (value: unknown) => unknown) => resolve({ rowCount: 1 }),
      };

      return builder;
    },
    delete: () => {
      const builder: Record<string, unknown> = {
        where: () => builder,
        // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable, and this fake stands in for one
        then: (resolve: (value: unknown) => unknown) => resolve({ rowCount: 1 }),
      };

      return builder;
    },
  };

  if (options.runner === 'run') {
    db.run = () => {
      recorder.calls.push('run');

      return Promise.resolve();
    };
  }

  if (options.runner === 'execute') {
    db.execute = () => {
      recorder.calls.push('execute');

      return Promise.resolve();
    };
  }

  if (options.supportsTransaction === true) {
    db.transaction = <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      recorder.calls.push('transaction');

      return work(db);
    };
  }

  return { db: db as unknown as DrizzleDatabase, recorder };
}
