# Architecture

The port keeps the architecture of `laravel-sisp` 2.x: actions, builders, pipelines, drivers, and contracts. Laravel's container is replaced by explicit constructor wiring in `createSisp`.

```
src/
  config.ts              SispConfig, defaults, credential mapping
  create-sisp.ts         composition root
  sisp.ts                public facade
  scoped-sisp.ts         forCredentials facade
  wiring.ts              credential-scoped service wiring (shared with ScopedSisp)
  contracts/             SispDriver, CredentialsResolver, PaymentPipe, CallbackPipe
  fingerprints/          token, payment, callback, refund algorithms
  support/               SispAmount, generators, countries, signed URLs, user agent
  enums/                 statuses, transaction codes, message types, translations
  value-objects/         CallbackPayload, PaymentRequest, RefundRequest, credentials
  actions/               one unit of work each, ported 1:1 from the PHP actions
  builders/              PaymentBuilder, RefundBuilder
  pipelines/
    payment/             context plus five pipes
    callback/            context plus five pipes
  drivers/               SispManager, production, sandbox, TransactionStatusClient
  database/
    migrations/          bundled schema, mirror of the Laravel migrations
    models/              table gateways (Transaction, Invoice, RateLimit, ...)
    encryption.ts        AES-256-GCM payload cipher
    log-context.ts       AsyncLocalStorage log source, like TransactionLogContext
  http/                  pure handlers, validation, results, auto-submit forms
  express/ fastify/ nest/  thin adapters over the same handlers
  sandbox.ts             fake gateway payload builder
  events.ts              typed emitter
  cli.ts, cli/           sisp binary
```

## Key decisions

- **Pipelines** are arrays of `{ handle(context, next) }` objects executed by a tiny async runner. The default pipe sets can be customized per flow through `pipelines.payment` and `pipelines.callback`.
- **Models** are table gateways over knex, not an ORM. `Transaction.update` diffs changes, encrypts the payload, and appends the audit log in one place.
- **Drivers** decide the payment endpoint and the status API client. `manager.extend('custom', factory)` registers new gateways.
- **Credential scoping** rebuilds only the credential-dependent services (`wiring.ts`) around a static resolver, which is how `forCredentials` works without a container.
- **Parity** with the PHP package is pinned by golden vectors generated from the real implementation, not by re-derived constants.

## Differences from the Laravel package

- Rendering is out of scope: the core returns render-ready data and HTML auto-submit forms only.
- PDF invoice generation is deferred; the invoice rows and statuses are maintained.
- Geolocation providers are not bundled; metadata captures device data only.
- Scheduling is the host's job: call `reconcilePending()` from your scheduler or cron the CLI.

**Next:** [Index](00-index.md)
