# API Reference

## `@akira-io/sisp`

### Entry point

- `createSisp(config: SispConfig): Promise<Sisp>` boots knex, runs migrations when `autoMigrate` is on, and wires every service.
- `createStatelessSisp(config: StatelessSispConfig): StatelessSisp` wires the same gateway protocol with no database. See [Stateless Mode](13-stateless-mode.md).

### `StatelessSisp`

`Sisp extends StatelessSisp`, so every member below is also available on `Sisp`.

| Member | Description |
|--------|-------------|
| `payment()` | `PaymentBuilder` with fluent setters and `build()` |
| `buildRequestPayload(data)` | Signed `PaymentRequest` from raw data |
| `validateCallback(payload)` | Constant-time fingerprint check |
| `handleCallback(payload, expected?)` | Runs the callback pipeline, returns `{ verified, status, reason, payload }`. `verified` means the callback is authentic (fingerprint and amount/currency/code matched against `correlation`, the `expected` argument, or the `expectedPayment` lookup); it is not a payment verdict. A `completed` callback with nothing to match against is rejected with `expected_payment_missing`. Check `status` for that - see [Stateless Mode](13-stateless-mode.md#verified-is-authenticity-not-a-payment-verdict). `status` is `null` on a rejected outcome, because it is derived from a `messageType` nobody authenticated |
| `generateSandboxPayload(data, status?, errorOverrides?)` | Signed fake callback. `errorOverrides` replaces any of `errorCode`, `errorDescription`, `errorDetail` and `additionalErrorMessage` on a `failed` payload |
| `queryTransactionStatus(merchantRef)` | POS transaction-status API call |
| `driver(name?)` | Resolves the active or a named `SispDriver` |
| `on(event, listener)` / `off(...)` | Typed event subscription |
| `handlers` | `StatelessHttpHandlers` - framework-agnostic HTTP handlers used by the stateless adapters |
| `destroy()` | No-op on the base; overridden by `Sisp` |

### `Sisp`

| Member | Description |
|--------|-------------|
| `refund(transaction)` | `RefundBuilder` with `amount()`, `full()`, `reason()`, `process()` |
| `cancel(transaction, reason?)` | Cancels and emits `transaction:cancelled` |
| `manager` | `SispManager` with `extend(name, factory)` |
| `models` | `transactions`, `transactionItems`, `transactionAttempts`, `paymentIntents`, `invoices`, `transactionLogs`, `blacklist` |
| `storage` | The `SispStorage` the instance was built with. For a raw knex handle pass `sisp` to `knexOf(sisp)` from `@akira-io/sisp/knex` |
| `handlers` | `SispHttpHandlers` - framework-agnostic HTTP handlers used by the adapters. Key methods: `handlePayment`, `handlePaymentIntent`, `handleCallback`, `handleRetryPayment`, `handleCancel`, `handleRefund(request, transactionId, authorize?)` (denies by default), `handleTransactionStatus(request, ref, authorize?)`, `handleSandbox`, `handleCountries` |
| `handleCallback(payload)` | Runs the callback pipeline, returns `{ verified, status, reason, payload, transaction }`. Same caveat as the stateless entry: `verified` is authenticity, not a payment verdict |
| `queryTransactionStatus(transactionOrRef)` | POS transaction-status API call |
| `reconcileTransactionStatus(transaction)` | Applies the gateway verdict to one pending transaction |
| `reconcilePending(options?)` | Batch reconciliation, `{ skipped, checked, reconciled }` |
| `pruneRequestMetadata(options?)` | Deletes `sisp_request_metadata` rows older than `options.olderThanDays` (falls back to `security.metadataRetentionDays`) and returns `{ deleted }` for the whole run, not for the first batch. The window is required and must be a non-negative integer; `RetentionWindowRequiredError` and `RetentionWindowInvalidError` say which rule was broken. `options.batch` (default 500) must be an integer between 1 and 999 |
| `countPrunableRequestMetadata(options?)` | Counts what `pruneRequestMetadata` would delete for the same window, without deleting it. Backs `prune-metadata --dry-run` |
| `rotateEncryptionKey(options?)` | Re-encrypts every stored payload onto the current `appKey` in pages of `options.batch` (default 200, must be an integer between 1 and 999), returns `{ processed, rewritten, current, plaintext, unreadable, vanished, unreadableValues, unreadableValueCount, stoppedEarly, stoppedAtTable }`. `processed` counts rows and equals the sum of the five row counters; `unreadableValues` lists at most the first 50 failed values, each `{ table, id, column, reason }`, while `unreadableValueCount` counts them all. `stoppedEarly` is true when the rotation gave up because nothing in one table was readable, and `stoppedAtTable` names that table, or is `null` when `stoppedEarly` is false. See [Security](07-security.md#rotating-appkey) |
| `forCredentials(credentials)` | `ScopedSisp` for multi-merchant setups |
| `signedRetryUrl(id)` / `signedCancelUrl(ref)` | HMAC-signed lifecycle URLs |
| `destroy()` | Closes the database pool |

### Events

| Event | Mode | Payload |
|-------|------|---------|
| `payment:completed` / `payment:failed` / `payment:pending` | stateful only | `{ transaction, payload }` |
| `callback:verified` / `callback:rejected` | both | `{ payload, status, reason }`, emitted in both stateless and stateful mode. `status` is `null` on `callback:rejected`, except on a `UserCancelled` request, where `cancelled` comes from the package rather than the payload. `callback:verified` fires for every authentic, matching callback, including declines - check `status`, not the event name, before fulfilling anything. For a `UserCancelled` request, `callback:rejected` fires only when the reference matches a payment the consumer recorded (see [Stateless mode](13-stateless-mode.md) for exact conditions in each mode). Both routes also reject with `callback_replayed` for a duplicate delivery and `unknown_transaction` for a reference nobody created |
| `transaction:cancelled` | stateful only | `{ transaction, reason }` |
| `transaction:refunded` | stateful only | `{ transaction, amount, reason }` |

### Utilities

`fromCents`, `toCents`, `toThousandths`, `computeToken`, `generatePaymentFingerprint`, `generateCallbackFingerprint`, `generateRefundFingerprint`, `validateCallbackFingerprint`, `callbackPayloadFrom`, `callbackPayloadToFormFields`, `paymentRequestToFormFields`, `paymentRequestDataFrom`, `validatePaymentInput`, `allCountries`, `findCountryByNumeric`, `getCountryName`, `getCountryFlag`, `getCountryNumericCode`, `mapTransactionStatus`, `MessageType`, `SUCCESS_MESSAGE_TYPES`, `isSuccessMessageType`, `isErrorMessageType`, `booleanSetting`, `structuredErrorFrom`, `callbackErrorFrom`, `resolveStatelessConfig`, `readStatelessResult`, `signStatelessResult`, `statelessResultData`, `isCallbackRejectionReason`.

`readStatelessResult` returns `SignedStatelessResultData`, not `StatelessPaymentResponseData`: its `error` is a `CarriedPaymentError` with `code` and `customerMessage` only, because the signed URL does not carry the gateway diagnostics. See [Stateless mode](13-stateless-mode.md#what-survives-the-signed-result-url).

`runMigrations`, `createKnexInstance`, `PayloadCipher`, and `runWithLogSource` moved to `@akira-io/sisp/knex` (see below) so the main entry stays knex-free at the type level.

### Errors

`SispError` is the base class for `BlacklistedIdentifierError`, `RateLimitExceededError`, `TransactionNotFoundError`, `TransactionStateError`, `DuplicatePaymentIdentifierError`, `PaymentIntentAlreadyProcessingError`, `IdempotencyKeyReusedError`, `PaymentRetryLimitExceededError`, `UnableToGenerateUniquePaymentIdentifiersError`, `MissingThreeDSecureDataError`, `TransactionStatusTransportError`, `CorrelationRequiredError`, and `RetentionWindowError`.

`RetentionWindowError` is itself the base for `RetentionWindowRequiredError`, thrown when neither `olderThanDays` nor `security.metadataRetentionDays` is set, and `RetentionWindowInvalidError`, thrown when the window is negative, fractional or `NaN`. The `prune-metadata` command catches the base class and reports either as a usage error.

`PaymentIntentAlreadyProcessingError` maps to HTTP 409 in the payment handler when an idempotency key is currently reserved but not yet linked to a transaction. `IdempotencyKeyReusedError` maps to HTTP 409 when a key is replayed with a different request body.

`CorrelationRequiredError` is thrown by `StatelessSispHttpHandlers.handlePayment` / `handlePaymentIntent` when no `correlation` store is configured. The stateless router only mounts those routes when `correlation` is present, so this only fires if you mount the handler by hand. See [Stateless Mode](13-stateless-mode.md).

## `@akira-io/sisp/express`

- `sispRoutes(sisp, options?)` returns an Express `Router`. Options: `authorizeRefund(req)` (denies by default), `authorizeTransactionStatus(req)` (allows by default).
- `statelessSispRoutes(statelessSisp)` returns an Express `Router` for a `StatelessSisp`.

## `@akira-io/sisp/fastify`

- `sispFastifyPlugin` to register with `{ sisp, prefix, authorizeRefund?, authorizeTransactionStatus? }`.
- `statelessSispFastifyPlugin` to register with `{ sisp: statelessSisp, prefix }`.

## `@akira-io/sisp/nest`

- `SispModule.forRoot({ sisp, authorizeRefund?, authorizeTransactionStatus?, globalPrefix? })` dynamic module, `createSispController(path)`, and the `SISP` injection token. The controller path comes from the `basePath` of the instance.
- `StatelessSispModule.forRoot({ sisp: statelessSisp, globalPrefix? })` dynamic module, `createStatelessSispController(path)`, and the `STATELESS_SISP` injection token.

## `@akira-io/sisp/knex`

Knex-typed surfaces kept off the main entry so a stateless consumer never needs `knex` installed to typecheck. See [Storage Adapters](12-storage-adapters.md).

- `knexOf(sisp)` returns the typed `Knex` instance backing a `Sisp`, or `undefined` at runtime when a non-knex storage is injected - the return type is `Knex | undefined`, matching that.
- `SispKnexDatabaseConfig` - `SispDatabaseConfig` with `connection` typed as knex's own `Knex.Config['connection']`, including the connection-provider function form. Assignable to `createSisp`'s `database` option.
- `createKnexInstance(config)`, `runMigrations(db, tables)`, `MIGRATIONS_TABLE`, `PayloadCipher`, `runWithLogSource(source, callback)`.

## CLI

```bash
npx sisp migrate
npx sisp reconcile-pending [--older-than <minutes>] [--limit <n>] [--force]
npx sisp prisma [--out <path>] [--print] [--models-only] [--force]
npx sisp prune-metadata [--older-than-days <n>] [--batch <n>] [--dry-run]
npx sisp rotate-key [--batch <n>]
```

`sisp help`, `sisp --help` and `sisp` with no command print the usage above and exit `0`.

Exit codes:

| Code | Meaning |
|---|---|
| `0` | The command completed. Every command except `rotate-key` returns `0` on completion |
| `1` | Usage or configuration error: an unknown command, an invalid flag value, a missing config file, or an existing Prisma schema without `--force` |
| `2` | `rotate-key` only: the rotation finished but left at least one value it could not read, so the old key must stay in `previousAppKeys` |

**Next:** [Architecture](10-architecture.md)
