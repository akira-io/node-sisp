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

Every interactive transaction the adapter opens - the callback pipeline, `storage.transaction()`, `transactions.update` and `rateLimits.hit` - is given `{ maxWait: 5000, timeout: 20000 }` instead of Prisma's 5 second default. The callback pipeline holds two row locks and writes four rows, so a database under load can exceed 5 seconds and abort a transaction that was about to commit; knex has no equivalent cap, and the default restores parity between the two adapters. Override `transactionOptions` to raise or lower it.

### The `provider` option

The `provider` value controls how the adapter issues row-level locks:

| Provider | Locking |
|----------|---------|
| `postgresql` | `SELECT ... FOR UPDATE` via `prisma.$queryRawUnsafe` |
| `mysql` | `SELECT ... FOR UPDATE` via `prisma.$queryRawUnsafe` |
| `sqlite` | No-op - SQLite serializes writes at the connection level |

The same locking behavior applies to the knex adapter: `pg` and `mysql2` use `FOR UPDATE`, `better-sqlite3` no-ops.

## Upgrading the schema

Release 1.0.0-beta.6 adds `sisp_payment_intents.request_hash` (knex migration `0006`) and `sisp_transactions.pos_id` (`0007`), and the Prisma schema gains the unique constraints and indexes listed above. Both adapters write the new columns on every insert, so run the migrations before deploying the new package version:

- knex: `npx @akira-io/sisp migrate` (or `autoMigrate: true`).
- Prisma: `npx @akira-io/sisp prisma --force`, `prisma migrate dev`, `prisma generate`. The unique constraints fail the migration if existing rows duplicate a `merchant_ref` or `merchant_session`; resolve those first.

`appKey` cannot be rotated in place: rows encrypted with the previous key stop decrypting. Keep the key stable, or set `allowWeakAppKey: true` while a short key is still in use.

## Contract suite

The shared suite `tests/storage/contract.ts` runs against both `KnexStorage` and `PrismaStorage`, guaranteeing behavioral parity. If a future adapter passes the contract suite, it is safe to use in production.

## Custom adapters

Any ORM or persistence library can satisfy the `SispStorage` port. Implement the nine repository interfaces and the `transaction()`, `destroy()`, and optional `migrate?()` methods, then inject the result:

```ts
import type { SispStorage } from '@akira-io/sisp';

class DrizzleStorage implements SispStorage {
  // ...implement all nine repositories
}

const sisp = await createSisp({
  posId: '...',
  posAutCode: '...',
  storage: new DrizzleStorage(db),
});
```

Drizzle, Sequelize, TypeORM, and any other ORM follow the same pattern.

**Previous:** [Idempotency and Attempts](11-idempotency.md) | **Next:** [Stateless Mode](13-stateless-mode.md)
