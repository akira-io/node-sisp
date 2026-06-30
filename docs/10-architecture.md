# Architecture

The port keeps the architecture of `laravel-sisp` 2.x: actions, builders, pipelines, drivers, and contracts. Laravel's container is replaced by explicit constructor wiring in `createSisp`. The layout is hexagonal: core contracts and domain sit at the centre; application orchestrates them; infrastructure provides the adapters; presentation exposes the HTTP surface.

```
src/
  core/
    contracts/           SispDriver, CredentialsResolver, PaymentPipe, CallbackPipe, SispStorage (port)
  domain/
    enums/               statuses, transaction codes, message types, translations
    errors/              SispError and typed subclasses
    policies/            domain rules (retry eligibility, refund limits, ...)
    value-objects/       CallbackPayload, PaymentRequest, RefundRequest, credentials
  application/
    config.ts            SispConfig, defaults, credential mapping
    create-sisp.ts       composition root
    sisp.ts              public facade
    scoped-sisp.ts       forCredentials facade
    wiring.ts            credential-scoped service wiring (shared with ScopedSisp)
    events.ts            typed emitter
    sandbox.ts           fake gateway payload builder
    actions/             one unit of work each, ported 1:1 from the PHP actions
    builders/            PaymentBuilder, RefundBuilder
    pipelines/
      payment/           context plus default payment pipes
      callback/          context plus default callback pipes
  infrastructure/
    drivers/             SispManager, production, sandbox, TransactionStatusClient
    fingerprints/        token, payment, callback, refund algorithms
    http/                pure handlers, idempotency resolver, validation, results, auto-submit forms
    storage/
      knex/              KnexStorage (the only adapter today)
        models/          repository implementations (Transaction, TransactionAttempt, PaymentIntent, ...)
        migrations/      bundled schema, mirror of the Laravel migrations
        create-knex.ts   knex instance factory
        auto-migrate.ts  migration runner
        encryption.ts    AES-256-GCM payload cipher
        locking.ts       row-level lock helper for supported drivers
        log-context.ts   AsyncLocalStorage log source
        records.ts       raw DB record types
  presentation/
    cli/                 sisp binary (migrate, reconcile-pending)
    express/             thin Express adapter
    fastify/             thin Fastify adapter
    nest/                thin NestJS adapter
  support/               SispAmount, generators, countries, signed URLs, user agent
```

## Key decisions

- **Pipelines** are arrays of `{ handle(context, next) }` objects executed by a tiny async runner. The default pipe sets can be customized per flow through `pipelines.payment` and `pipelines.callback`.
- **Models** are the knex adapter's repository implementations behind the `SispStorage` port. `Transaction.update` diffs changes, encrypts the payload, and appends the audit log in one place.
- **Payment intents** live at the HTTP boundary. They reserve checkout keys, link keys to transactions, and allow safe replay of the same checkout.
- **Transaction attempts** live under the parent transaction. They preserve every gateway submission and let callbacks update the exact attempt that SISP answered.
- **Drivers** decide the payment endpoint and the status API client. `manager.extend('custom', factory)` registers new gateways.
- **Credential scoping** rebuilds only the credential-dependent services (`wiring.ts`) around a static resolver, which is how `forCredentials` works without a container.
- **Parity** with the PHP package is pinned by golden vectors generated from the real implementation, not by re-derived constants.

## Storage adapters

The persistence layer sits behind an ORM-neutral port, `SispStorage`, defined in `src/core/contracts/storage.ts`: nine entity repositories plus a `transaction()` unit-of-work, an optional `migrate?()`, and `destroy()`. The port leaks no engine types.

Two adapters ship with the package:

- `KnexStorage` (`src/infrastructure/storage/knex/`) - the default, built from the `database` config. Handles migrations automatically and exposes `sisp.db` for raw queries.
- `PrismaStorage` (`src/infrastructure/storage/prisma/`) - available at the `@akira-io/sisp/prisma` subpath. Injected via `createSisp({ storage: createPrismaStorage(prisma, tables, appKey, { provider }) })`. The core bundle never imports `@prisma/client`.

Both adapters are validated by the shared contract suite `tests/storage/contract.ts`, which guarantees behavioral parity. See [Storage Adapters](12-storage-adapters.md) for the Prisma quick start and instructions for implementing custom adapters.

The application layer runs every database transaction through `storage.transaction(tx => ...)` with locked reads via the repository `...ForUpdate` methods, so atomicity and locking are adapter-decided.

Intentionally knex-coupled surfaces kept for this phase: the `database.connection` config type, the `sisp.db` escape hatch, the CLI `migrate` command, and the `runMigrations`/`createKnexInstance` re-exports. Engine selection and genericizing the `database` config are a later phase.

## Differences from the Laravel package

- Rendering is out of scope: the core returns render-ready data and HTML auto-submit forms only.
- PDF invoice generation is deferred; the invoice rows and statuses are maintained.
- Geolocation providers are not bundled; metadata captures device data only.
- Scheduling is the host's job: call `reconcilePending()` from your scheduler or cron the CLI.

**Next:** [Index](00-index.md)
