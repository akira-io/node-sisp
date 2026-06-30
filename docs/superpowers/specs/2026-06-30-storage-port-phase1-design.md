# Storage Port (Phase 1) — Design

## Goal

Introduce an ORM-neutral storage abstraction so `node-sisp` can run on different persistence engines. Phase 1 extracts the port and moves the existing knex code behind it with no behavior change. Later phases add adapters (Prisma, Drizzle, Sequelize, TypeORM).

This spec covers Phase 1 only.

## Non-goals (Phase 1)

- No new engine. knex stays the only adapter.
- No public config change. `database: { client, connection, autoMigrate }` keeps working and stays the default.
- No engine selection mechanism (lands in Phase 2 with the first non-knex adapter).
- No behavior change. All existing tests pass unchanged.

## Problem

The persistence layer is knex-coupled across both infrastructure and application layers:

- 9 model classes use the knex query builder directly.
- The transaction boundary lives in the application layer: ~9 `db.transaction(...)` sites (payment/callback pipes, refund/fail/retry actions) plus 17 `withConnection(trx)` calls thread a knex transaction into models.
- Pessimistic locking uses knex `forUpdate()` in 4 places (transaction, attempt, rate-limit), skipped on sqlite.

To support other engines, these three concerns (repositories, unit-of-work, locking) must be expressed through an interface that leaks no knex (or prisma) types.

## Architecture

### Storage port

`src/core/contracts/storage.ts` defines the port, in domain terms only (records from `records.ts`, no engine types):

- `SispStorage` aggregates one repository per entity, plus lifecycle and unit-of-work:
  - `transactions`, `transactionItems`, `transactionAttempts`, `paymentIntents`, `invoices`, `transactionLogs`, `blacklist`, `rateLimits`, `requestMetadata`
  - `transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T>` — runs `work` atomically; `tx` exposes the same repositories, transaction-scoped.
  - `migrate?(): Promise<void>` — optional; engines that own their own schema omit it.
  - `destroy(): Promise<void>`
- `SispStorageTx` is the transaction-scoped view: the same repository set, no nested `transaction()`.

Each repository is its own interface (`TransactionRepository`, `TransactionAttemptRepository`, …) declaring exactly the methods the application uses today, extracted verbatim from the current model classes. Locking stays explicit through the existing `...ForUpdate` read methods (`findByIdForUpdate`, `findByRefAndSessionForUpdate`, the attempt locked read, the rate-limit locked upsert); the adapter decides how to lock.

### knex adapter

`src/infrastructure/storage/knex/` holds `KnexStorage implements SispStorage`. The current model classes become the knex repository implementations (moved here, unchanged logic). `create-knex`, `auto-migrate`, `locking`, `list-options`, and the payload cipher move under this folder. `KnexStorage.transaction(work)` wraps `db.transaction` and builds a `tx` whose repositories are bound to the trx connection (replacing the public `withConnection` pattern, which becomes an internal detail of the adapter).

`migrate()` runs `runMigrations`. `autoMigrate` from config only gates the knex adapter.

### Application layer

Pipes and actions stop importing knex, `db.transaction`, and `withConnection`. They depend on `SispStorage`:

- `storage.transaction(async (tx) => { ... tx.transactions.update(...) ... })` replaces `db.transaction(trx => model.withConnection(trx)...)`.
- Locked reads call the repository `...ForUpdate` methods on `tx`.
- Ad-hoc knex queries in the application/HTTP layer (e.g. listing) move onto repository methods (`transactions.list(...)` already exists from the merged work).

`createSisp` builds the storage from config and injects it wherever `db` and the model instances were injected. The public `Sisp` surface keeps `sisp.models.*` working by mapping it to the storage repositories so consumers are unaffected; `sisp.db` (raw knex) is retained for the knex adapter but documented as adapter-specific.

### Encryption

The payload cipher stays adapter-side, factored into a shared helper under the knex storage folder so future adapters reuse the same encrypt/decrypt mapping. Phase 1 keeps the current call sites (no behavior change); moving encryption above the port is deferred.

## Data flow (unchanged semantics)

Payment and callback pipelines run exactly as today; only the transaction/locking calls are expressed through the port. The atomic guarantees (single DB transaction per persist/callback-apply, row locks on pg/mysql, sqlite without locks) are preserved by the knex adapter.

## Error handling

No new error types. Database errors surface as today. The unit-of-work rolls back on a thrown error, matching the current `db.transaction` behavior.

## Testing

- All existing tests pass unchanged; this is a pure refactor.
- Add a reusable storage contract test suite that exercises a `SispStorage` instance through the port (create/find/update, locked reads, atomic rollback, list bounds). Phase 1 runs it against `KnexStorage`; Phase 2 reuses it for every new adapter as parity tests.

## Risks

- The transaction/locking boundary is cross-cutting; the refactor must keep every `db.transaction` site atomic and every locked read locked. The contract test plus the unchanged existing suite guard this.
- File moves are large; keep them mechanical and behavior-preserving.

## Out of scope (later phases)

- Phase 2: Prisma adapter (`PrismaStorage`), canonical `schema.prisma`, interactive-transaction unit-of-work, `$queryRaw FOR UPDATE` for pg/mysql, engine selection in config.
- Phase 3+: Drizzle, Sequelize, TypeORM adapters, each validated by the shared contract test.
