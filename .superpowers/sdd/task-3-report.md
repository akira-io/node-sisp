# Task 3 Report: knex adapter

Plan reference: docs/superpowers/plans/2026-06-30-storage-port-phase1.md

## File Moves

All 23 files moved from `src/infrastructure/database/` to `src/infrastructure/storage/knex/` using `git mv`:

- `auto-migrate.ts`, `create-knex.ts`, `encryption.ts`, `list-options.ts`, `locking.ts`, `log-context.ts`, `records.ts`, `transaction-log-pruning.ts`
- `models/` — blacklist, invoice, payment-intent, rate-limit, request-metadata, transaction-attempt, transaction-item, transaction-log, transaction-row, transaction
- `migrations/` — create-payment-intents-table, create-sisp-tables, create-transaction-attempts-table, create-transaction-logs-table, index

Import paths updated across all 70 affected files (src + tests + HTTP layer + CLI).

## Models gaining `withConnection`

All 9 models already had `withConnection` in place (added by prior task steps):
- `blacklist.ts`, `invoice.ts`, `payment-intent.ts`, `rate-limit.ts`, `request-metadata.ts`, `transaction.ts`, `transaction-attempt.ts`, `transaction-item.ts`, `transaction-log.ts`

No new additions were required.

## KnexStorage shape

`src/infrastructure/storage/knex/knex-storage.ts`:
- `implements SispStorage`
- `static create(database: Required<SispDatabaseConfig>, tables: SispTables, appKey: string | null): KnexStorage`
- 9 readonly repository properties: `transactions`, `transactionItems`, `transactionAttempts`, `paymentIntents`, `invoices`, `transactionLogs`, `blacklist`, `rateLimits`, `requestMetadata`
- `async transaction<T>(work)` — wraps `db.transaction((trx) => work(this.scoped(trx)))`
- `private scoped(trx)` — returns `SispStorageTx` with each repo bound via `withConnection(trx)`
- `async migrate()` — runs `runMigrations` only when `database.autoMigrate` is true
- `async destroy()` — calls `db.destroy()`
- `get raw(): Knex` — exposes underlying connection
- 121 lines (well under 300-line cap)

## Verification Results

1. **`npm run typecheck`** — PASS, zero errors
2. **`npx vitest run tests/storage/knex.test.ts`** — PASS, 6/6 tests green
3. **`npm test`** — PASS, 390 tests across 38 test files (all green, including the 6 newly-passing contract tests)
4. **`npm run lint`** — PASS, 0 errors / 2 warnings (same 2 pre-existing warnings, no new errors; fixed organizeImports issues from import reordering via `biome check --write`)

## Commit

Hash: `46e18d5`
Message: `refactor(storage): move knex persistence behind KnexStorage`
