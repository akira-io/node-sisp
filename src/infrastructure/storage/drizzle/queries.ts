import type { SQL } from 'drizzle-orm';
import { asc, desc } from 'drizzle-orm';
import type { DrizzleConnection, DrizzleRow, DrizzleSelectBuilder } from './client';
import { serialize } from './client';
import type { SispTableKey } from './schema/spec';
import { tableSpec } from './schema/spec';
import type { SispDrizzleSchema, SispSchemaTable } from './schema/types';

interface ListWindow {
  limit?: number;
  offset?: number;
  orderBy?: SQL[];
}

export class TableGateway {
  private readonly timestampColumns: readonly string[];

  constructor(
    private readonly connection: DrizzleConnection,
    private readonly schema: SispDrizzleSchema,
    private readonly key: SispTableKey,
  ) {
    this.timestampColumns = tableSpec(key)
      .columns.filter((column) => column.type.kind === 'timestamp')
      .map((column) => column.name);
  }

  get table(): SispSchemaTable {
    return this.schema[this.key];
  }

  column(name: string): SQL {
    const column = this.table[name];

    if (column === undefined) {
      throw new Error(`No column ${name} on ${this.key}.`);
    }

    return column as unknown as SQL;
  }

  ascending(name: string): SQL {
    return asc(this.column(name));
  }

  descending(name: string): SQL {
    return desc(this.column(name));
  }

  timestampValue(iso: string): string | Date {
    return this.connection.dialect === 'sqlite' ? iso : new Date(iso);
  }

  ordered(name: string, order: 'asc' | 'desc'): SQL {
    return order === 'desc' ? this.descending(name) : this.ascending(name);
  }

  async all(condition: SQL | undefined, window: ListWindow = {}): Promise<DrizzleRow[]> {
    return serialize(this.connection, () => this.runSelect(condition, window));
  }

  async ids(condition: SQL | undefined, window: ListWindow = {}): Promise<number[]> {
    const rows = await serialize(this.connection, () =>
      this.runSelect(condition, window, { id: this.column('id') }),
    );

    return rows.map((row) => Number(row.id));
  }

  async valuesOf(
    name: string,
    condition: SQL | undefined,
    window: ListWindow = {},
  ): Promise<unknown[]> {
    const rows = await serialize(this.connection, () =>
      this.runSelect(condition, window, { [name]: this.column(name) }),
    );

    return rows.map((row) => row[name]);
  }

  async assertColumnsExist(): Promise<void> {
    await serialize(this.connection, () => this.runSelect(undefined, { limit: 0 }));
  }

  async exists(condition: SQL | undefined): Promise<boolean> {
    const [row] = await this.ids(condition, { limit: 1 });

    return row !== undefined;
  }

  private async runSelect(
    condition: SQL | undefined,
    window: ListWindow,
    fields?: Record<string, unknown>,
  ): Promise<DrizzleRow[]> {
    let query = this.connection.db.select(fields).from(this.table).where(condition);

    if (window.orderBy !== undefined && window.orderBy.length > 0) {
      query = query.orderBy(...window.orderBy);
    }

    if (window.limit !== undefined) {
      query = query.limit(window.limit);
    }

    if (window.offset !== undefined && window.offset > 0) {
      query = query.offset(window.offset);
    }

    return query;
  }

  async first(condition: SQL | undefined, window: ListWindow = {}): Promise<DrizzleRow | null> {
    const [row] = await this.all(condition, { ...window, limit: 1 });

    return row ?? null;
  }

  async firstForUpdate(condition: SQL | undefined): Promise<DrizzleRow | null> {
    return serialize(this.connection, async () => {
      const query = this.locked(this.connection.db.select().from(this.table).where(condition));
      const [row] = await query.limit(1);

      return row ?? null;
    });
  }

  async insert(values: DrizzleRow | DrizzleRow[]): Promise<void> {
    await serialize(this.connection, async () => {
      await this.connection.db.insert(this.table).values(this.write(values));
    });
  }

  async insertReturningId(values: DrizzleRow): Promise<number> {
    return serialize(this.connection, async () => {
      const builder = this.connection.db.insert(this.table).values(this.write(values));

      if (typeof builder.returning === 'function') {
        const [row] = await builder.returning();

        return Number(row?.id);
      }

      return insertedId(await builder);
    });
  }

  async insertIgnoringConflicts(values: DrizzleRow): Promise<void> {
    await serialize(this.connection, async () => {
      const builder = this.connection.db.insert(this.table).values(this.write(values));

      if (typeof builder.onConflictDoNothing === 'function') {
        await builder.onConflictDoNothing();

        return;
      }

      if (typeof builder.onDuplicateKeyUpdate === 'function') {
        await builder.onDuplicateKeyUpdate({ set: { id: this.column('id') } });

        return;
      }

      await builder;
    });
  }

  async update(condition: SQL | undefined, values: DrizzleRow): Promise<number> {
    return serialize(this.connection, async () => {
      const result = await this.connection.db
        .update(this.table)
        .set(this.write(values))
        .where(condition);

      return rowsAffected(result);
    });
  }

  async delete(condition: SQL | undefined): Promise<number> {
    return serialize(this.connection, async () =>
      rowsAffected(await this.connection.db.delete(this.table).where(condition)),
    );
  }

  private locked(query: DrizzleSelectBuilder): DrizzleSelectBuilder {
    if (this.connection.dialect === 'sqlite' || typeof query.for !== 'function') {
      return query;
    }

    return query.for('update');
  }

  private write<T extends DrizzleRow | DrizzleRow[]>(values: T): T {
    if (this.connection.dialect === 'sqlite') {
      return values;
    }

    if (Array.isArray(values)) {
      return values.map((row) => this.writeRow(row)) as T;
    }

    return this.writeRow(values) as T;
  }

  private writeRow(values: DrizzleRow): DrizzleRow {
    const written: DrizzleRow = { ...values };

    for (const name of this.timestampColumns) {
      const value = written[name];

      if (typeof value === 'string') {
        written[name] = new Date(value);
      }
    }

    return written;
  }
}

function header(result: unknown): Record<string, unknown> {
  if (Array.isArray(result)) {
    return header(result[0]);
  }

  return (result ?? {}) as Record<string, unknown>;
}

function rowsAffected(result: unknown): number {
  const head = header(result);
  const count = head.changes ?? head.rowCount ?? head.affectedRows ?? 0;

  return Number(count);
}

function insertedId(result: unknown): number {
  const head = header(result);
  const id = head.lastInsertRowid ?? head.insertId ?? head.id;

  if (id === undefined || id === null) {
    throw new Error('The Drizzle driver returned no identifier for the inserted row.');
  }

  return Number(id);
}
