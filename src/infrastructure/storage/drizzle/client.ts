import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { DrizzleDialect } from './migrations';
import type { SispSchemaTable } from './schema/types';
import type { StatementQueue } from './serialization';

export type DrizzleRow = Record<string, unknown>;

export interface DrizzleSelectBuilder extends PromiseLike<DrizzleRow[]> {
  from(table: SispSchemaTable): DrizzleSelectBuilder;
  where(condition: SQL | undefined): DrizzleSelectBuilder;
  orderBy(...columns: SQL[]): DrizzleSelectBuilder;
  limit(rows: number): DrizzleSelectBuilder;
  offset(rows: number): DrizzleSelectBuilder;
  for?(strength: 'update'): DrizzleSelectBuilder;
}

export interface DrizzleInsertBuilder extends PromiseLike<unknown> {
  values(values: DrizzleRow | DrizzleRow[]): DrizzleInsertBuilder;
  returning?(): PromiseLike<DrizzleRow[]>;
  onConflictDoNothing?(): DrizzleInsertBuilder;
  onDuplicateKeyUpdate?(config: { set: DrizzleRow }): DrizzleInsertBuilder;
}

export interface DrizzleUpdateBuilder extends PromiseLike<unknown> {
  set(values: DrizzleRow): DrizzleUpdateBuilder;
  where(condition: SQL | undefined): DrizzleUpdateBuilder;
}

export interface DrizzleDeleteBuilder extends PromiseLike<unknown> {
  where(condition: SQL | undefined): DrizzleDeleteBuilder;
}

export interface DrizzleDatabase {
  select: (...args: never[]) => unknown;
  insert: (...args: never[]) => unknown;
  update: (...args: never[]) => unknown;
  delete: (...args: never[]) => unknown;
  transaction: (...args: never[]) => unknown;
}

export interface DrizzleQueryRunner {
  select(fields?: Record<string, unknown>): DrizzleSelectBuilder;
  insert(table: SispSchemaTable): DrizzleInsertBuilder;
  update(table: SispSchemaTable): DrizzleUpdateBuilder;
  delete(table: SispSchemaTable): DrizzleDeleteBuilder;
  transaction?<T>(work: (tx: DrizzleQueryRunner) => Promise<T>): Promise<T>;
  run?(query: SQL): PromiseLike<unknown>;
  execute?(query: SQL): PromiseLike<unknown>;
}

export function queryRunner(db: DrizzleDatabase): DrizzleQueryRunner {
  return db as unknown as DrizzleQueryRunner;
}

export interface DrizzleConnection {
  db: DrizzleQueryRunner;
  dialect: DrizzleDialect;
  inTransaction: boolean;
  queue: StatementQueue | null;
}

export function serialize<T>(connection: DrizzleConnection, work: () => Promise<T>): Promise<T> {
  return connection.queue === null ? work() : connection.queue.run(work);
}

export async function runRaw(db: DrizzleQueryRunner, statement: string): Promise<void> {
  const query = sql.raw(statement);

  if (typeof db.run === 'function') {
    await db.run(query);

    return;
  }

  if (typeof db.execute === 'function') {
    await db.execute(query);

    return;
  }

  throw new Error('The Drizzle database exposes neither run() nor execute().');
}

export async function runInTransaction<T>(
  connection: DrizzleConnection,
  work: (scoped: DrizzleConnection) => Promise<T>,
): Promise<T> {
  if (connection.inTransaction || connection.queue?.entered === true) {
    return work({ ...connection, inTransaction: true });
  }

  if (connection.dialect === 'sqlite') {
    return serialize(connection, () => runSqliteTransaction(connection, work));
  }

  const { db } = connection;

  if (typeof db.transaction !== 'function') {
    throw new Error(
      'The Drizzle database exposes no transaction(), so a unit of work cannot be made atomic.',
    );
  }

  return db.transaction((tx) => work({ ...connection, db: tx, inTransaction: true }));
}

async function runSqliteTransaction<T>(
  connection: DrizzleConnection,
  work: (scoped: DrizzleConnection) => Promise<T>,
): Promise<T> {
  const { db } = connection;

  await runRaw(db, 'BEGIN');

  try {
    const result = await work({ ...connection, inTransaction: true });

    await runRaw(db, 'COMMIT');

    return result;
  } catch (error) {
    await runRaw(db, 'ROLLBACK');

    throw error;
  }
}
