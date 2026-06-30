# API Reference

## `@akira-io/sisp`

### Entry point

- `createSisp(config: SispConfig): Promise<Sisp>` boots knex, runs migrations when `autoMigrate` is on, and wires every service.

### `Sisp`

| Member | Description |
|--------|-------------|
| `payment()` | `PaymentBuilder` with fluent setters and `build()` |
| `refund(transaction)` | `RefundBuilder` with `amount()`, `full()`, `reason()`, `process()` |
| `cancel(transaction, reason?)` | Cancels and emits `transaction:cancelled` |
| `on(event, listener)` / `off(...)` | Typed event subscription |
| `driver(name?)` | Resolves the active or a named `SispDriver` |
| `manager` | `SispManager` with `extend(name, factory)` |
| `models` | `transactions`, `transactionItems`, `transactionAttempts`, `paymentIntents`, `invoices`, `transactionLogs`, `blacklist` |
| `handlers` | `SispHttpHandlers` - framework-agnostic HTTP handlers used by the adapters. Key methods: `handlePayment`, `handlePaymentIntent`, `handleCallback`, `handleRetryPayment`, `handleCancel`, `handleRefund`, `handleSandbox` |
| `buildRequestPayload(data)` | Signed `PaymentRequest` from raw data |
| `validateCallback(payload)` | Constant-time fingerprint check |
| `handlePaymentCallback(payload)` | Runs the callback pipeline, returns the transaction |
| `generateSandboxPayload(data, status?)` | Signed fake callback |
| `queryTransactionStatus(refOrTransaction)` | POS transaction-status API call |
| `reconcileTransactionStatus(transaction)` | Applies the gateway verdict to one pending transaction |
| `reconcilePending(options?)` | Batch reconciliation, `{ skipped, checked, reconciled }` |
| `forCredentials(credentials)` | `ScopedSisp` for multi-merchant setups |
| `signedRetryUrl(id)` / `signedCancelUrl(ref)` | HMAC-signed lifecycle URLs |
| `destroy()` | Closes the database pool |

### Events

| Event | Payload |
|-------|---------|
| `payment:completed` / `payment:failed` / `payment:pending` | `{ transaction, payload }` |
| `transaction:cancelled` | `{ transaction, reason }` |
| `transaction:refunded` | `{ transaction, amount, reason }` |

### Utilities

`fromCents`, `toCents`, `toThousandths`, `computeToken`, `generatePaymentFingerprint`, `generateCallbackFingerprint`, `generateRefundFingerprint`, `validateCallbackFingerprint`, `callbackPayloadFrom`, `callbackPayloadToFormFields`, `paymentRequestToFormFields`, `paymentRequestDataFrom`, `validatePaymentInput`, `allCountries`, `findCountryByNumeric`, `getCountryName`, `getCountryFlag`, `getCountryNumericCode`, `mapTransactionStatus`, `errorMessageTypeFromValue` and label helpers, `runMigrations`, `createKnexInstance`, `PayloadCipher`, `runWithLogSource`.

### Errors

`SispError` is the base class for `BlacklistedIdentifierError`, `RateLimitExceededError`, `TransactionNotFoundError`, `PaymentIntentAlreadyProcessingError`, and `MissingThreeDSecureDataError`.

`PaymentIntentAlreadyProcessingError` maps to HTTP 409 in the payment handler when an idempotency key is currently reserved but not yet linked to a transaction.

## `@akira-io/sisp/express`

- `sispRoutes(sisp, options?)` returns an Express `Router`. Options: `authorizeRefund(req)`.

## `@akira-io/sisp/fastify`

- `sispFastifyPlugin` to register with `{ sisp, prefix, authorizeRefund? }`.

## `@akira-io/sisp/nest`

- `SispModule.forRoot({ sisp, authorizeRefund? })` dynamic module, `SispController`, and the `SISP` injection token.

## CLI

```bash
npx sisp migrate
npx sisp reconcile-pending [--older-than <minutes>] [--limit <n>] [--force]
```

**Next:** [Architecture](10-architecture.md)
