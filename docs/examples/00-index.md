# Examples

Runnable patterns validated against the live SISP/Vinti4 gateway with a standalone consumer app. Each example is self-contained and uses only the package's public API.

| # | Example | What it shows |
|---|---------|---------------|
| 01 | [Fastify production](01-fastify-production.md) | Mounting the gateway with the production driver and 3D Secure |
| 02 | [Decoupled SPA (React)](02-spa-react.md) | API-only backend: JSON payment intent, full-page gateway hop, frontend result redirect |
| 03 | [Handling cancellation](03-cancellation.md) | Reacting to `transaction:cancelled` when the customer cancels on the gateway |
| 04 | [Handling failed payments](04-failed-payments.md) | Reacting to `payment:failed`, including 3D Secure / OTP failures |
| 05 | [Listing transactions](05-listing-transactions.md) | Paginated, hydrated transaction listing |
| 06 | [Decoupled SPA: Vue and Svelte](06-spa-frameworks.md) | The same SPA flow in Vue and Svelte |

**Next:** [Fastify production](01-fastify-production.md)
