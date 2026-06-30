# Fastify examples

Every example here runs on the Fastify adapter, validated against the live SISP/Vinti4 gateway. The storage variants wire the same app to a different persistence engine; the frontend and behavior examples are storage-agnostic and each shows both options where it matters.

## Storage

| Storage | Example |
|---------|---------|
| knex | [Fastify with knex storage](knex.md) |
| Prisma | [Fastify with Prisma storage](prisma.md) |

## Rendering

| Example | What it shows |
|---------|---------------|
| [Server-side rendering](ssr.md) | Server-rendered pages, full-page HTML form to `POST /sisp/payment`, no client framework |

## Decoupled SPA frontend

Same API-only backend (knex or Prisma), one file per view layer:

| Example | What it shows |
|---------|---------------|
| [React](react.md) | JSON payment intent, full-page gateway hop, frontend result redirect; shows both knex and Prisma backends |
| [Vue](vue.md) | The same SPA flow in Vue |
| [Svelte](svelte.md) | The same SPA flow in Svelte |

## Behavior

| Example | What it shows |
|---------|---------------|
| [Handling cancellation](cancellation.md) | Reacting to `transaction:cancelled` when the customer cancels on the gateway |
| [Handling failed payments](failed-payments.md) | Reacting to `payment:failed`, including 3D Secure / OTP failures |
| [Listing transactions](listing-transactions.md) | Paginated, hydrated transaction listing |

**Next:** [Fastify with knex storage](knex.md)
