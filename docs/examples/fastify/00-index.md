# Fastify examples

Every example here runs on the Fastify adapter, validated against the live SISP/Vinti4 gateway. The storage variants wire the same app to a different persistence engine; the frontend and behavior examples are storage-agnostic and each shows both options where it matters.

## Storage

| Storage | Example |
|---------|---------|
| knex | [Fastify with knex storage](knex.md) |
| Prisma | [Fastify with Prisma storage](prisma.md) |

## Decoupled SPA frontend

| Example | What it shows |
|---------|---------------|
| [Decoupled SPA (React)](spa-react.md) | API-only backend (knex and Prisma), JSON payment intent, full-page gateway hop, frontend result redirect |
| [Decoupled SPA: Vue and Svelte](spa-frameworks.md) | The same SPA flow in Vue and Svelte |

## Behavior

| Example | What it shows |
|---------|---------------|
| [Handling cancellation](cancellation.md) | Reacting to `transaction:cancelled` when the customer cancels on the gateway |
| [Handling failed payments](failed-payments.md) | Reacting to `payment:failed`, including 3D Secure / OTP failures |
| [Listing transactions](listing-transactions.md) | Paginated, hydrated transaction listing |

**Next:** [Fastify with knex storage](knex.md)
