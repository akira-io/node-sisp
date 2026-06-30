# Examples

Runnable patterns validated against the live SISP/Vinti4 gateway with a standalone consumer app. Each example is self-contained and uses only the package's public API.

Examples are organized by HTTP adapter, then by storage engine, so the same app is shown on each persistence option:

| Adapter | Storage | Example |
|---------|---------|---------|
| Fastify | knex | [Fastify with knex storage](fastify/knex.md) |
| Fastify | Prisma | [Fastify with Prisma storage](fastify/prisma.md) |

Other adapters (Express, NestJS) follow the same `adapter/storage` layout as they are added.

## Patterns

| Example | What it shows |
|---------|---------------|
| [Decoupled SPA (React)](02-spa-react.md) | API-only backend: JSON payment intent, full-page gateway hop, frontend result redirect |
| [Handling cancellation](03-cancellation.md) | Reacting to `transaction:cancelled` when the customer cancels on the gateway |
| [Handling failed payments](04-failed-payments.md) | Reacting to `payment:failed`, including 3D Secure / OTP failures |
| [Listing transactions](05-listing-transactions.md) | Paginated, hydrated transaction listing |
| [Decoupled SPA: Vue and Svelte](06-spa-frameworks.md) | The same SPA flow in Vue and Svelte |

**Next:** [Fastify with knex storage](fastify/knex.md)
