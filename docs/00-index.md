# Documentation

Framework-agnostic Node.js client for the SISP/Vinti4 payment gateway (Cabo Verde), ported from [akira-io/laravel-sisp](https://github.com/akira-io/laravel-sisp).

## Guides

| # | Guide | Description |
|---|-------|-------------|
| 01 | [Installation](01-installation.md) | Package install, database drivers, migrations, CLI |
| 02 | [Configuration](02-configuration.md) | Every `createSisp` option and its default |
| 03 | [Quick Start](03-quick-start.md) | First payment with the sandbox in five minutes |
| 04 | [Payment Flow](04-payment-flow.md) | Pipelines, validation, form fields, callback handling |
| 05 | [Transaction Management](05-transaction-management.md) | Retry, cancel, refund, reconciliation, audit logs |
| 06 | [Adapters](06-adapters.md) | Express, Fastify, and NestJS integrations |
| 07 | [Security](07-security.md) | Fingerprints, payload encryption, signed URLs, guards |
| 08 | [Sandbox and Testing](08-sandbox-testing.md) | Fake gateway, golden vectors, test strategies |
| 09 | [API Reference](09-api-reference.md) | Public exports of every entry point |
| 10 | [Architecture](10-architecture.md) | Actions, builders, pipelines, drivers, contracts |
| 11 | [Idempotency and Attempts](11-idempotency.md) | Payment intents, retries, attempt audit trail, collision handling |
| 12 | [Storage Adapters](12-storage-adapters.md) | SispStorage port, Prisma quick start, custom ORM adapters |

## Examples

Patterns validated against the live gateway. See [examples](examples/00-index.md).

| # | Example | What it shows |
|---|---------|---------------|
| 01 | [Fastify with knex storage](examples/fastify/knex.md) | Mounting the gateway with knex storage and 3D Secure |
| 01 | [Fastify with Prisma storage](examples/fastify/prisma.md) | The same Fastify app on an injected Prisma client |
| 02 | [Decoupled SPA (React)](examples/02-spa-react.md) | API-only backend feeding a React frontend |
| 03 | [Handling cancellation](examples/03-cancellation.md) | Reacting to `transaction:cancelled` |
| 04 | [Handling failed payments](examples/04-failed-payments.md) | Reacting to `payment:failed` and OTP failures |
| 05 | [Listing transactions](examples/05-listing-transactions.md) | Paginated, hydrated listing |
| 06 | [Decoupled SPA: Vue and Svelte](examples/06-spa-frameworks.md) | The same SPA flow in Vue and Svelte |

**Next:** [Installation](01-installation.md)
