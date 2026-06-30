# Task 4 Report: Build Sisp through KnexStorage

## Changes in create-sisp.ts

- Removed 11 imports: `createKnexInstance`, `runMigrations`, `PayloadCipher`, and all 9 concrete model constructors (`Transaction`, `TransactionItem`, `TransactionAttempt`, `PaymentIntent`, `Invoice`, `TransactionLog`, `Blacklist`, `RateLimit`, `RequestMetadata`).
- Added single import: `KnexStorage` from `../infrastructure/storage/knex/knex-storage`.
- Replaced `createKnexInstance(resolved.database)` + `runMigrations(db, resolved.tables)` + `new PayloadCipher(resolved.appKey)` + 9 model constructions with:
  - `const storage = KnexStorage.create(resolved.database, resolved.tables, resolved.appKey);`
  - `if (resolved.database.autoMigrate) await storage.migrate();`
- `db` is now derived as `const db = storage.raw;` and still flows unchanged into `wireCredentialScopedServices`, `PersistTransaction`, `CreateRetryPaymentAttemptAction`, `RefundTransactionAction`, and `SispHttpHandlers`.
- `models: SispModels` is populated from storage repos (`storage.transactions`, etc.).
- `rateLimits` is `storage.rateLimits`.
- `StoreRequestMetadataAction` receives `storage.requestMetadata` directly instead of `new RequestMetadata(db, resolved.tables)`.
- `storage` is passed as a new third argument to `new Sisp(...)`.

## Changes in sisp.ts

- Added import for `SispStorage` from `../core/contracts/storage`.
- Added `private readonly _storage: SispStorage` as the third constructor parameter (after `db: Knex`, before `events`).
- Added `get storage(): SispStorage` getter exposing the storage port.
- `destroy()` now delegates to `this._storage.destroy()` instead of `this.db.destroy()`.
- All existing public members (`config`, `db`, `events`, `manager`, `models`, `handlers`) are unchanged.

## Changes in knex-storage.ts

- Removed private `transactionsModel`, `transactionItemsModel`, etc. fields.
- Changed public repo fields to use concrete model types (`Transaction`, `TransactionItem`, etc.) instead of repository interface types, matching the concrete types expected by `SispModels`, actions, pipes, and handlers.
- `scoped()` now references `this.transactions.withConnection(trx)` etc. directly.
- Trimmed unused repository interface imports; kept only `SispStorage` and `SispStorageTx`.

## How db/models/rateLimits/requestMetadata are sourced

| Local | Source |
|---|---|
| `db` | `storage.raw` (KnexStorage.raw returns the Knex instance) |
| `models.transactions` | `storage.transactions` |
| `models.transactionItems` | `storage.transactionItems` |
| `models.transactionAttempts` | `storage.transactionAttempts` |
| `models.paymentIntents` | `storage.paymentIntents` |
| `models.invoices` | `storage.invoices` |
| `models.transactionLogs` | `storage.transactionLogs` |
| `models.blacklist` | `storage.blacklist` |
| `rateLimits` | `storage.rateLimits` |
| `requestMetadata` | `storage.requestMetadata` (passed to StoreRequestMetadataAction) |

## Public surface preservation

- `sisp.db` — preserved as `readonly db: Knex` (type and value unchanged).
- `sisp.models` — preserved as `readonly models: SispModels` (same shape, now sourced from storage).
- `sisp.storage` — new getter returning `SispStorage`.
- All other public members unchanged.

## Verification results

- `npm run typecheck`: PASS (no errors)
- `npm test`: PASS (390 tests, 38 test files, all green)
- `npm run lint`: PASS (2 pre-existing warnings in unrelated files, no new errors)
