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
| `handleCallback(payload, expected?)` | Runs the callback pipeline, returns `{ verified, status, reason, payload }`. `verified` means the callback is authentic (fingerprint and amount/currency/code matched against `correlation`, the `expected` argument, or the `expectedPayment` lookup); it is not a payment verdict. A `completed` callback with nothing to match against is rejected with `expected_payment_missing`. Check `status` for that - see [Stateless Mode](13-stateless-mode.md#verified-is-authenticity-not-a-payment-verdict) |
| `generateSandboxPayload(data, status?)` | Signed fake callback |
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
| `db` | Typed `unknown` on this entry. Pass `sisp` to `knexOf(sisp)` from `@akira-io/sisp/knex` to get the typed knex instance |
| `handlers` | `SispHttpHandlers` - framework-agnostic HTTP handlers used by the adapters. Key methods: `handlePayment`, `handlePaymentIntent`, `handleCallback`, `handleRetryPayment`, `handleCancel`, `handleRefund`, `handleTransactionStatus(request, ref, authorize?)`, `handleSandbox`, `handleCountries` |
| `handleCallback(payload)` | Runs the callback pipeline, returns `{ verified, status, reason, payload, transaction }`. Same caveat as the stateless entry: `verified` is authenticity, not a payment verdict |
| `queryTransactionStatus(transactionOrRef)` | POS transaction-status API call |
| `reconcileTransactionStatus(transaction)` | Applies the gateway verdict to one pending transaction |
| `reconcilePending(options?)` | Batch reconciliation, `{ skipped, checked, reconciled }` |
| `forCredentials(credentials)` | `ScopedSisp` for multi-merchant setups |
| `signedRetryUrl(id)` / `signedCancelUrl(ref)` | HMAC-signed lifecycle URLs |
| `destroy()` | Closes the database pool |

### Events

| Event | Payload |
|-------|---------|
| `payment:completed` / `payment:failed` / `payment:pending` | `{ transaction, payload }` |
| `callback:verified` / `callback:rejected` | `{ payload, status, reason }`, emitted in both stateless and stateful mode. `callback:verified` fires for every authentic, matching callback, including declines - check `status`, not the event name, before fulfilling anything. For a `UserCancelled` request, `callback:rejected` fires only when the reference matches a payment the consumer recorded (see [Stateless mode](13-stateless-mode.md) for exact conditions in each mode) |
| `transaction:cancelled` | `{ transaction, reason }` |
| `transaction:refunded` | `{ transaction, amount, reason }` |

### Utilities

`fromCents`, `toCents`, `toThousandths`, `computeToken`, `generatePaymentFingerprint`, `generateCallbackFingerprint`, `generateRefundFingerprint`, `validateCallbackFingerprint`, `callbackPayloadFrom`, `callbackPayloadToFormFields`, `paymentRequestToFormFields`, `paymentRequestDataFrom`, `validatePaymentInput`, `allCountries`, `findCountryByNumeric`, `getCountryName`, `getCountryFlag`, `getCountryNumericCode`, `mapTransactionStatus`, `MessageType`, `SUCCESS_MESSAGE_TYPES`, `isSuccessMessageType`, `isErrorMessageType`, `booleanSetting`, `structuredErrorFrom`, `callbackErrorFrom`, `resolveStatelessConfig`, `readStatelessResult`, `signStatelessResult`, `statelessResultData`, `isCallbackRejectionReason`.

`runMigrations`, `createKnexInstance`, `PayloadCipher`, and `runWithLogSource` moved to `@akira-io/sisp/knex` (see below) so the main entry stays knex-free at the type level.

### Errors

`SispError` is the base class for `BlacklistedIdentifierError`, `RateLimitExceededError`, `TransactionNotFoundError`, `TransactionStateError`, `DuplicatePaymentIdentifierError`, `PaymentIntentAlreadyProcessingError`, `IdempotencyKeyReusedError`, `PaymentRetryLimitExceededError`, `UnableToGenerateUniquePaymentIdentifiersError`, `MissingThreeDSecureDataError`, `TransactionStatusTransportError`, and `CorrelationRequiredError`.

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
```

**Next:** [Architecture](10-architecture.md)
