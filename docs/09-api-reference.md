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
| `handleCallback(payload)` | Runs the callback pipeline, returns `{ verified, reason, payload }` |
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
| `handlers` | `SispHttpHandlers` - framework-agnostic HTTP handlers used by the adapters. Key methods: `handlePayment`, `handlePaymentIntent`, `handleCallback`, `handleRetryPayment`, `handleCancel`, `handleRefund`, `handleSandbox` |
| `handleCallback(payload)` | Runs the callback pipeline, returns `{ verified, reason, payload, transaction }` |
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
| `callback:verified` / `callback:rejected` | `{ payload, reason }`, emitted in both stateless and stateful mode |
| `transaction:cancelled` | `{ transaction, reason }` |
| `transaction:refunded` | `{ transaction, amount, reason }` |

### Utilities

`fromCents`, `toCents`, `toThousandths`, `computeToken`, `generatePaymentFingerprint`, `generateCallbackFingerprint`, `generateRefundFingerprint`, `validateCallbackFingerprint`, `callbackPayloadFrom`, `callbackPayloadToFormFields`, `paymentRequestToFormFields`, `paymentRequestDataFrom`, `validatePaymentInput`, `allCountries`, `findCountryByNumeric`, `getCountryName`, `getCountryFlag`, `getCountryNumericCode`, `mapTransactionStatus`, `errorMessageTypeFromValue` and label helpers, `runMigrations`, `createKnexInstance`, `PayloadCipher`, `runWithLogSource`, `booleanSetting`, `structuredErrorFrom`, `resolveStatelessConfig`, `readStatelessResult`, `signStatelessResult`, `statelessResultData`, `isCallbackRejectionReason`.

### Errors

`SispError` is the base class for `BlacklistedIdentifierError`, `RateLimitExceededError`, `TransactionNotFoundError`, `PaymentIntentAlreadyProcessingError`, `MissingThreeDSecureDataError`, and `CorrelationRequiredError`.

`PaymentIntentAlreadyProcessingError` maps to HTTP 409 in the payment handler when an idempotency key is currently reserved but not yet linked to a transaction.

`CorrelationRequiredError` is thrown by `StatelessSispHttpHandlers.handlePayment` / `handlePaymentIntent` when no `correlation` store is configured. The stateless router only mounts those routes when `correlation` is present, so this only fires if you mount the handler by hand. See [Stateless Mode](13-stateless-mode.md).

## `@akira-io/sisp/express`

- `sispRoutes(sisp, options?)` returns an Express `Router`. Options: `authorizeRefund(req)`.
- `statelessSispRoutes(statelessSisp)` returns an Express `Router` for a `StatelessSisp`.

## `@akira-io/sisp/fastify`

- `sispFastifyPlugin` to register with `{ sisp, prefix, authorizeRefund? }`.
- `statelessSispFastifyPlugin` to register with `{ sisp: statelessSisp, prefix }`.

## `@akira-io/sisp/nest`

- `SispModule.forRoot({ sisp, authorizeRefund? })` dynamic module, `SispController`, and the `SISP` injection token.
- `StatelessSispModule.forRoot({ sisp: statelessSisp })` dynamic module, `StatelessSispController`, and the `STATELESS_SISP` injection token.

## CLI

```bash
npx sisp migrate
npx sisp reconcile-pending [--older-than <minutes>] [--limit <n>] [--force]
```

**Next:** [Architecture](10-architecture.md)
