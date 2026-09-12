# Storage Adapters

The persistence layer sits behind `SispStorage`, an ORM-neutral port defined in `src/core/contracts/storage.ts`. It describes nine entity repositories plus a `transaction()` unit-of-work, an optional `migrate?()`, and `destroy()`. No engine types leak through the port.

This port is for consumers who want the package's own tables (`sisp_transactions` and friends). If you already own transaction tables and want none of these nine repositories, see [Stateless Mode](13-stateless-mode.md) instead.

## Default adapter: knex

When you pass a `database` config to `createSisp`, the package builds a `KnexStorage` instance internally:

```ts
const sisp = await createSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
  },
});
```

`KnexStorage` handles migrations automatically (`autoMigrate: true` by default). The core bundle (`@akira-io/sisp`) never imports `knex` at the type level either, and it loads the adapter itself through a dynamic import taken only when no `storage` is injected. A consumer that brings its own adapter runs with `knex` absent from `node_modules` and never evaluates the adapter. For raw queries, import `knexOf` from the `@akira-io/sisp/knex` subpath:

```ts
import { knexOf } from '@akira-io/sisp/knex';

const db = knexOf(sisp);
await db(sisp.config.tables.transactions).where('status', 'pending');
```

> Note: `knexOf(sisp)` reads the handle off `sisp.storage` and returns `undefined` when that storage is not knex-backed; use the repositories via `sisp.models` / `sisp.storage` instead.

`@akira-io/sisp/knex` also re-exports `createKnexInstance`, `runMigrations`, `MIGRATIONS_TABLE`, `PayloadCipher`, and `runWithLogSource`, all moved off the main entry so importing them is the explicit signal that you are in stateful, knex-backed mode.

## Prisma adapter

`PrismaStorage` is shipped at the `@akira-io/sisp/prisma` subpath. The core bundle (`@akira-io/sisp`) never imports `@prisma/client`; the dependency is optional and only loaded when you import the subpath yourself.

### Quick start

**1. Install the peer:**

```bash
npm install @prisma/client
```

**2. Copy the reference schema into your project:**

The package ships a complete Prisma schema covering all nine `sisp_*` tables. Use the bundled CLI command to copy it:

```bash
# Copy the full schema (datasource + generator + models) to ./prisma/sisp.prisma
npx @akira-io/sisp prisma

# Write to a custom path
npx @akira-io/sisp prisma --out src/prisma/sisp.prisma

# If your schema.prisma already declares a datasource and generator, copy only the
# model blocks and append them to your existing file
npx @akira-io/sisp prisma --models-only --print >> prisma/schema.prisma

# Print to stdout without writing a file (for inspection or piping)
npx @akira-io/sisp prisma --print

# Replace an existing file
npx @akira-io/sisp prisma --force
```

Alternatively, copy the file manually from `node_modules/@akira-io/sisp/prisma/sisp.prisma`.

The shipped schema declares the same unique constraints and indexes as the knex migrations: `merchant_ref` on transactions, `merchant_session`, `(merchant_ref, merchant_session)` and `(transaction_id, attempt_number)` on attempts, plus the secondary indexes callbacks and reconciliation rely on. Keep them when you merge the models into your own schema; the callback pipeline resolves a callback to one attempt by that pair, and the retry logic depends on the unique violation to detect identifier collisions.

**3. Migrate:**

```bash
npx prisma migrate dev --name sisp-tables
```

The package does not run migrations for the Prisma path. Running `prisma migrate` (or `prisma db push` in development) is your responsibility.

**4. Inject the adapter:**

```ts
import { PrismaClient } from '@prisma/client';
import { createSisp } from '@akira-io/sisp';
import { createPrismaStorage } from '@akira-io/sisp/prisma';

const prisma = new PrismaClient();

const sisp = await createSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  appKey: process.env.SISP_APP_KEY,
  storage: createPrismaStorage(prisma, undefined, process.env.SISP_APP_KEY, {
    provider: 'postgresql',
  }),
});
```

Pass `undefined` as the `tables` argument to use the default table names (`sisp_transactions`, `sisp_transaction_items`, etc.). To rename tables, pass a `SispTables` object instead.

### `createPrismaStorage` signature

```ts
function createPrismaStorage(
  prisma: PrismaClientLike,
  tables: SispTables | undefined,
  appKey: string | null,
  options: {
    provider: 'postgresql' | 'mysql' | 'sqlite';
    transactionOptions?: { maxWait?: number; timeout?: number; isolationLevel?: string };
  },
): SispStorage
```

### The `transactionOptions` option

Every interactive transaction the adapter opens - the callback pipeline, `storage.transaction()`, `transactions.update` and `rateLimits.hit` - is given `{ maxWait: 5000, timeout: 20000 }` instead of Prisma's 5 second default. The callback pipeline holds two row locks and writes four rows, so a database under load can exceed 5 seconds and abort a transaction that was about to commit; knex has no equivalent cap, and the default restores parity between the two adapters. Override `transactionOptions` to raise or lower it. The cost of the higher ceiling is that a transaction holding the `FOR UPDATE` lock on a hot row - the rate limit row of one identifier, for instance - can hold it four times longer before the database gives up on it.

### The `provider` option

The `provider` value controls how the adapter issues row-level locks:

| Provider | Locking |
|----------|---------|
| `postgresql` | `SELECT ... FOR UPDATE` via `prisma.$queryRawUnsafe` |
| `mysql` | `SELECT ... FOR UPDATE` via `prisma.$queryRawUnsafe` |
| `sqlite` | No-op - SQLite serializes writes at the connection level |

The same locking behavior applies to the knex adapter: `pg` and `mysql2` use `FOR UPDATE`, `better-sqlite3` no-ops.

### JSON columns

`sisp_transaction_items.metadata` and the three value columns of `sisp_transaction_logs` hold a JSON document, not a string of JSON. Both adapters write a value the column stores as a document - the Prisma adapter passes the structure itself, knex passes the serialized form the `json` column parses on the way in - so `metadata->>'key'` works in Postgres. Rows written by an earlier version of the Prisma adapter stored the document as an encoded string; reads still parse those, so no backfill is required, but queries that reach into the column will not see them until they are rewritten.

`sisp_request_metadata.custom_metadata` is declared `Json` but holds AES-256-GCM ciphertext, not a queryable document. Read it through the adapter, which decrypts it; JSON operators against that column match nothing.

## Drizzle adapter

`DrizzleStorage` is shipped at the `@akira-io/sisp/drizzle` subpath. The core bundle never imports `drizzle-orm`; the dependency is optional and only loaded when you import the subpath yourself.

### Quick start

**1. Install the peer:**

```bash
npm install drizzle-orm
```

**2. Build the storage over your existing Drizzle database and migrate:**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createSisp } from '@akira-io/sisp';
import { createDrizzleStorage } from '@akira-io/sisp/drizzle';

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

const storage = createDrizzleStorage(db, undefined, process.env.SISP_APP_KEY, {
  dialect: 'postgresql',
  autoMigrate: true,
});

await storage.migrate();

const sisp = await createSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  appKey: process.env.SISP_APP_KEY,
  storage,
});
```

`createSisp` only calls `migrate()` for the storage it builds itself from a `database` config. An injected storage is yours to migrate, so call `storage.migrate()` before the first payment, or manage the schema with Drizzle Kit and leave `autoMigrate` off.

Pass `undefined` as the `tables` argument to use the default table names. `dialect` is one of `postgresql`, `mysql` or `sqlite` and must match the driver the Drizzle instance was built with; it decides row locking, conflict handling and how timestamps are bound.

### `createDrizzleStorage` signature

```ts
function createDrizzleStorage(
  db: DrizzleDatabase,
  tables: SispTables | undefined,
  appKey: string | null,
  options: {
    dialect: 'postgresql' | 'mysql' | 'sqlite';
    schema?: SispDrizzleSchema;
    autoMigrate?: boolean;
  },
): SispStorage
```

### Tables and migrations

The adapter builds its own Drizzle table definitions from one canonical specification, so the three dialects cannot drift apart. Import them when you want to query the `sisp_*` tables with your own Drizzle code:

```ts
import { sispDrizzleSchema } from '@akira-io/sisp/drizzle';

const schema = sispDrizzleSchema('postgresql', sisp.config.tables);

await db.select().from(schema.transactions).where(eq(schema.transactions.status, 'pending'));
```

`migrate()` creates every table, foreign key, unique constraint and index from that same specification, and runs only when `autoMigrate: true`. It emits `CREATE TABLE IF NOT EXISTS`, so repeating it on a database it created is a no-op.

It never alters an existing table. Because of that, it checks after the create pass that every table carries every column the adapter writes, and throws naming the table when one does not. A schema created by an older release, which lacks `sisp_transactions.pos_id` or `sisp_payment_intents.request_hash`, is therefore refused at startup rather than failing later on the first payment; upgrade it through the knex migrations or your own Drizzle Kit migration first.

`migrate()` takes no migration lock, unlike the knex path, which serializes on a Postgres advisory lock. Two processes calling it concurrently against the same Postgres database can race on `CREATE TABLE IF NOT EXISTS`. Run it once at deploy time rather than on every replica's boot.

To manage the schema with Drizzle Kit instead, leave `autoMigrate` off and generate migrations from the exported definitions; the DDL the adapter would emit is available through `createSispTablesSql(tables, dialect)` if you prefer to inspect or apply it yourself.

Index names follow the knex convention, `<table>_<columns>_index`, so a database created by either path recognises the other's indexes. MySQL rejects identifiers past 64 characters, so on that dialect only, a longer name is shortened with a deterministic suffix.

### Row locking and transactions

`findByIdForUpdate` and `findByRefAndSessionForUpdate` take `FOR UPDATE` on `postgresql` and `mysql`, and no-op on `sqlite`, matching the knex and Prisma adapters.

`storage.transaction()` delegates to Drizzle's own `transaction()` on `postgresql` and `mysql`, where the driver hands the unit of work its own connection. A database handle that exposes no `transaction()` is refused rather than silently run without one. Nested calls run inline on the open transaction rather than opening a savepoint, as they do on the Prisma adapter.

`sqlite` has no connection to scope a transaction to: `drizzle-orm/better-sqlite3` runs its native transaction synchronously and would commit before an asynchronous unit of work had finished, so the adapter issues `BEGIN`, `COMMIT` and `ROLLBACK` itself over the one handle. Because that handle is shared, every statement the adapter runs on `sqlite` is serialized behind any open unit of work. Without that, a second concurrent transaction would fail on a nested `BEGIN`, and a write issued outside the unit of work would be swallowed by its `ROLLBACK`. Serializing costs nothing that `better-sqlite3` was not already paying, since it is synchronous and single-writer; it does mean the `sqlite` dialect gives you no write concurrency, which is a reason to prefer `postgresql` under load.

`destroy()` is a no-op. The Drizzle handle and its pool are yours; close them yourself when the process shuts down.

### Verified dialects

The shared contract suite runs the Drizzle adapter on **sqlite and Postgres**. The Postgres run needs `SISP_TEST_POSTGRES_URL`; it executes the generated DDL, asserts the foreign keys the canonical schema declares, and then runs the same suite the sqlite and Prisma adapters run. CI sets that variable, so a green build means both dialects were executed.

**MySQL is not executed anywhere.** Its schema, its DDL and its three divergent code paths (insert without `RETURNING`, `ON DUPLICATE KEY UPDATE`, `longtext` payload columns) are covered by parity tests and by a fake driver, not by a real server. Treat MySQL as unverified until [#107](https://github.com/akira-io/node-sisp/issues/107) closes for it. On MySQL the adapter also inherits [#137](https://github.com/akira-io/node-sisp/issues/137): the first rate limit hit can still be lost under `REPEATABLE READ`.

## Upgrading the schema

Release 1.0.0-beta.6 adds `sisp_payment_intents.request_hash` (knex migration `0006`) and `sisp_transactions.pos_id` (`0007`), and the Prisma schema gains the unique constraints and indexes listed above. Both adapters write the new columns on every insert, so run the migrations before deploying the new package version:

- knex: `npx @akira-io/sisp migrate` (or `autoMigrate: true`).
- Prisma: `npx @akira-io/sisp prisma --force`, `prisma migrate dev`, `prisma generate`. The unique constraints fail the migration if existing rows duplicate a `merchant_ref` or `merchant_session`; resolve those first.

`appKey` cannot be rotated in place: rows encrypted with the previous key stop decrypting. Keep the key stable, or set `allowWeakAppKey: true` while a short key is still in use.

## Contract suite

The shared suite `tests/storage/contract.ts` runs against `KnexStorage`, `PrismaStorage` and `DrizzleStorage`, guaranteeing behavioral parity. If a future adapter passes the contract suite, it is safe to use in production. The suite runs on sqlite only ([#107](https://github.com/akira-io/node-sisp/issues/107)), so a green run is not by itself proof of parity on Postgres or MySQL.

## Custom adapters

Any ORM or persistence library can satisfy the `SispStorage` port. Implement the nine repository interfaces and the `transaction()`, `destroy()`, and optional `migrate?()` methods, then inject the result:

```ts
import type { SispStorage } from '@akira-io/sisp';

class SequelizeStorage implements SispStorage {
  // ...implement all nine repositories
}

const sisp = await createSisp({
  posId: '...',
  posAutCode: '...',
  storage: new SequelizeStorage(db),
});
```

Sequelize, TypeORM, and any other ORM follow the same pattern.

**Previous:** [Idempotency and Attempts](11-idempotency.md) | **Next:** [Stateless Mode](13-stateless-mode.md)
