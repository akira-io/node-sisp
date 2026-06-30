# Fastify examples

Every example here runs on the Fastify adapter, validated against the live SISP/Vinti4 gateway. The storage variants wire the same app to a different persistence engine; the frontend and behavior examples are storage-agnostic and each shows both options where it matters.

## Storage

| Storage | Example |
|---------|---------|
| knex | [Fastify with knex storage](01-knex.md) |
| Prisma | [Fastify with Prisma storage](02-prisma.md) |

## Rendering

| Example | What it shows |
|---------|---------------|
| [Server-side rendering](03-ssr.md) | Server-rendered pages, full-page HTML form to `POST /sisp/payment`, no client framework |

## Decoupled SPA frontend

Same API-only backend (knex or Prisma), one file per view layer:

| Example | What it shows |
|---------|---------------|
| [React](04-react.md) | JSON payment intent, full-page gateway hop, frontend result redirect; shows both knex and Prisma backends |
| [Vue](05-vue.md) | The same SPA flow in Vue |
| [Svelte](06-svelte.md) | The same SPA flow in Svelte |

## Behavior

| Example | What it shows |
|---------|---------------|
| [Handling cancellation](07-cancellation.md) | Reacting to `transaction:cancelled` when the customer cancels on the gateway |
| [Handling failed payments](08-failed-payments.md) | Reacting to `payment:failed`, including 3D Secure / OTP failures |
| [Listing transactions](09-listing-transactions.md) | Paginated, hydrated transaction listing |

**Next:** [Fastify with knex storage](01-knex.md)
