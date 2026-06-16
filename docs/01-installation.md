# Installation

## Requirements

- Node.js 20 or higher
- A database: SQLite (better-sqlite3), PostgreSQL (pg), or MySQL (mysql2)

## Install the package

```bash
npm install @akira-io/sisp
```

Install the database driver you plan to use. Drivers are optional peer dependencies, so only the one you pick gets installed:

```bash
npm install better-sqlite3   # local development and small deployments
npm install pg               # PostgreSQL
npm install mysql2           # MySQL
```

If you mount the HTTP routes, install the framework adapter peer as well. Fastify is the default adapter (`fastify` plus `@fastify/formbody`); `express` and `@nestjs/common` are supported alternatives.

## Migrations

The schema ships inside the package and runs automatically the first time `createSisp` boots (`autoMigrate: true` by default). Progress is tracked in its own `sisp_migrations` control table, so repeated boots are no-ops.

For production setups that forbid DDL at boot time, disable it and run the CLI instead:

```ts
const sisp = await createSisp({
  // ...
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    autoMigrate: false,
  },
});
```

```bash
npx sisp migrate
```

The CLI reads the configuration from `sisp.config.js`, `sisp.config.mjs`, `sisp.config.cjs`, or `sisp.config.json` in the working directory. The JavaScript variants must default-export the same object you pass to `createSisp`.

## Created tables

`sisp_transactions`, `sisp_transaction_items`, `sisp_transaction_attempts`, `sisp_payment_intents`, `sisp_invoices`, `sisp_request_metadata`, `sisp_rate_limits`, `sisp_blacklist`, and `sisp_transaction_logs`. All names are configurable through the `tables` option.

**Next:** [Configuration](02-configuration.md)
