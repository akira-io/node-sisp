# Storage Adapters

The persistence layer sits behind `SispStorage`, an ORM-neutral port defined in `src/core/contracts/storage.ts`. It describes nine entity repositories plus a `transaction()` unit-of-work, an optional `migrate?()`, and `destroy()`. No engine types leak through the port.

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

`KnexStorage` handles migrations automatically (`autoMigrate: true` by default) and re-exports its knex instance as `sisp.db` for any raw queries your application needs.

> Note: `sisp.db` (the raw knex instance) is unavailable (`undefined`) when a non-knex storage is injected; use the repositories via `sisp.models` / `sisp.storage` instead.

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
  options: { provider: 'postgresql' | 'mysql' | 'sqlite' },
): SispStorage
```

### The `provider` option

The `provider` value controls how the adapter issues row-level locks:

| Provider | Locking |
|----------|---------|
| `postgresql` | `SELECT ... FOR UPDATE` via `prisma.$queryRawUnsafe` |
| `mysql` | `SELECT ... FOR UPDATE` via `prisma.$queryRawUnsafe` |
| `sqlite` | No-op - SQLite serializes writes at the connection level |

The same locking behavior applies to the knex adapter: `pg` and `mysql2` use `FOR UPDATE`, `better-sqlite3` no-ops.

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

**Previous:** [Idempotency and Attempts](11-idempotency.md) | **Next:** [Index](00-index.md)
