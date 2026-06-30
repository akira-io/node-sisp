# Task 5 Report — Run application transactions through the storage port

Pure, behavior-preserving refactor. Each of the 6 units that owned a DB transaction now depends on
`SispStorage` instead of raw `Knex` + injected model instances. Atomic boundaries, lock targets, and
operation ordering are byte-for-byte identical.

## Per-unit conversions

### 1. `src/application/pipelines/payment/pipes/persist-transaction.ts`
- Constructor: `(config, db, transactions, attempts, items, invoices, buildRequestPayload)` -> `(config, storage, buildRequestPayload)`.
- `db.transaction(trx => ...)` -> `storage.transaction(tx => ...)`.
  - `transactions.withConnection(trx).create/update` -> `tx.transactions.create/update`.
  - `attempts.withConnection(trx).createForPayment` -> `tx.transactionAttempts.createForPayment`.
  - `items.withConnection(trx).createMany` -> `tx.transactionItems.createMany`.
- Out-of-tx best-effort invoice stub: `this.invoices.createForTransaction` -> `this.storage.invoices.createForTransaction`.
- No locked reads in this unit. Removed `Knex`, `Invoice`, `Transaction`, `TransactionAttempt`, `TransactionItem` imports.

### 2. `src/application/pipelines/callback/pipes/apply-transaction-status.ts`
- Constructor: `(db, transactions, attempts)` -> `(storage)`.
- `db.transaction` -> `storage.transaction`.
- Locked reads preserved exactly, same order:
  - `attempts.findByRefAndSessionForUpdate` -> `tx.transactionAttempts.findByRefAndSessionForUpdate` (locks the attempt first).
  - `transactions.findByIdForUpdate` -> `tx.transactions.findByIdForUpdate` (then locks the transaction).
- Updates: `tx.transactionAttempts.update`, `tx.transactions.update`. Removed `Knex`, `Transaction`, `TransactionAttempt` (type) imports.

### 3. `src/application/pipelines/callback/pipes/resolve-transaction.ts`
- Constructor: `(db, transactions, attempts)` -> `(storage)`.
- Non-tx fast path: `this.attempts.findByRefAndSession` / `this.transactions.findById` -> `this.storage.transactionAttempts.findByRefAndSession` / `this.storage.transactions.findById`.
- Legacy path tx: `db.transaction` -> `storage.transaction`. Locked reads preserved in order:
  - `transactions.findByRefAndSessionForUpdate` -> `tx.transactions.findByRefAndSessionForUpdate` (locks transaction first).
  - `attempts.findByRefAndSessionForUpdate` -> `tx.transactionAttempts.findByRefAndSessionForUpdate`.
  - fallback create `tx.transactionAttempts.createFromTransaction`.

### 4. `src/application/actions/refund-transaction.ts`
- Constructor: `(db, transactions, buildRefundRequest, events)` -> `(storage, buildRefundRequest, events)`.
- `db.transaction` -> `storage.transaction`.
  - Locked read: `transactions.findByIdForUpdate(transaction.id)` -> `tx.transactions.findByIdForUpdate(transaction.id)` (same row, same lock).
- `refundLockedTransaction` param type changed from `Transaction` (model) to `TransactionRepository` (port interface); receives `tx.transactions`. Its single write `transactions.update` unchanged in semantics.
- Event emission (`transaction:refunded`) untouched, still after the tx commits. Removed `Knex`, `Transaction` imports.

### 5. `src/application/actions/fail-transaction.ts`
- Constructor: `(db, transactions, attempts)` -> `(storage)`.
- `db.transaction` -> `storage.transaction`. No locked reads in this unit (it updates a record it was handed).
  - `attempts.update` -> `tx.transactionAttempts.update`; `transactions.update` -> `tx.transactions.update`.
- Removed `Knex`, `Transaction` imports.

### 6. `src/application/actions/create-retry-payment-attempt.ts`
- Constructor: `(config, db, transactions, attempts, retryPayment, canRetryPayment)` -> `(config, storage, retryPayment, canRetryPayment)`.
- Retry tx: `db.transaction` -> `storage.transaction`; `attempts.createForPayment(..., true)` -> `tx.transactionAttempts.createForPayment`; `transactions.update` -> `tx.transactions.update`.
- Out-of-tx `ensureInitialAttempt`: `this.attempts.listByTransaction/createFromTransaction/existsByTransaction` -> `this.storage.transactionAttempts.*`. No locked reads here. Removed `Knex`, `Transaction`, `TransactionAttempt` imports.

## Wiring / construction changes
- `src/application/wiring.ts`: `wireCredentialScopedServices` signature changed from `(db: Knex, config, events, models, credentialsResolver)` to `(storage: SispStorage, config, events, models, credentialsResolver)`. `db` was no longer referenced in the body, so it was dropped entirely (avoids unused-param lint). `FailTransactionAction`, `ResolveTransaction`, `ApplyTransactionStatus` now receive `storage`.
- `src/application/create-sisp.ts`: `PersistTransaction`, `CreateRetryPaymentAttemptAction`, `RefundTransactionAction` now receive `storage`; the `wireCredentialScopedServices(...)` call passes `storage`. `db`/`models` still threaded to handlers and `Sisp`.
- `src/application/scoped-sisp.ts` + `src/application/sisp.ts` (necessary follow-through caller, surfaced by typecheck): `ScopedSisp` now takes `storage: SispStorage` instead of `db` (it only used `db` to call `wireCredentialScopedServices`); `Sisp.forCredentials` passes `this._storage`.

## Test-setup changes (units are constructed directly in two pipeline tests)
- `tests/pipelines/payment-pipeline.test.ts` and `tests/pipelines/callback-pipeline.test.ts`: replaced the raw `createKnexInstance` + hand-built model objects with `KnexStorage.create(config.database, config.tables, config.appKey)`, using `storage.raw` as `db` for migrations/direct queries and `storage.<repo>` for the model variables used in assertions. Units are now constructed with `storage`. No assertions or expectations changed. These are setup-only edits; behavior under test is identical.

## Verification
- `npm run typecheck`: clean (0 errors).
- `npm test`: 390 passed (38 files).
- `npm run lint`: 2 warnings, both pre-existing on the base branch (verified via `git stash`): `src/presentation/nest/index.ts` noStaticOnlyClass, `tests/database/transaction-list.test.ts` noNonNullAssertion. No new lint errors introduced by this task.

## Concerns
- None on correctness. Two unrelated, pre-existing lint warnings remain (untouched files). `.superpowers/sdd/progress.md` carried a pre-existing uncommitted edit from Task 4; included in the commit via `git add -A`.
