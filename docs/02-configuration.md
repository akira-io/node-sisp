# Configuration

`createSisp(config)` accepts a single object. Only `posId`, `posAutCode`, and `database` are required; every other key mirrors `config/sisp.php` from the Laravel package and keeps the same default.

## Credentials and gateway

| Key | Default | Description |
|-----|---------|-------------|
| `posId` | required | Virtual POS terminal id issued by SISP |
| `posAutCode` | required | Virtual POS terminal password, source of every fingerprint |
| `url` | `''` | Gateway payment URL used by the production driver |
| `currency` | `'132'` | ISO 4217 numeric code, Cabo Verde Escudo |
| `languageMessages` | `'EN'` | Language for gateway response messages |
| `fingerprintVersion` | `'1'` | Payment request fingerprint version |
| `is3DSec` | `'0'` | Set `'1'` to require 3D Secure customer data |
| `transactionCode` | `'1'` | Default transaction type (purchase) |

SISP issues two different numbers, and this package wants only one of them. `posId` is the Virtual POS
terminal. The merchant id is a separate number that never leaves your records: it is not part of the
payment payload and not part of any fingerprint, so there is no config key for it.

Passing the merchant id as `posId` is the easiest mistake to make here, and the symptom does not point
at it. `posId` is hashed into every payment request fingerprint, so the gateway rejects each attempt
before it ever reaches the card form, answering with `messageType 6` and `Fingerprint Invalid`. The
error names the fingerprint, not the field, so it reads like a broken signature rather than a swapped
value.

## Application wiring

| Key | Default | Description |
|-----|---------|-------------|
| `database` | required | `{ client, connection, autoMigrate }` passed to knex. `connection` is typed loosely (`string \| object \| (() => object \| Promise<object>)`) on the main entry so consumers do not need `knex` installed to typecheck; import `SispKnexDatabaseConfig` from `@akira-io/sisp/knex` for the fully-typed knex connection shapes, including knex's connection-provider function form for rotating credentials |
| `appKey` | `null` | Key for payload encryption (AES-256-GCM) and signed URLs |
| `baseUrl` | `''` | Absolute origin used when building route URLs |
| `basePath` | `'/sisp'` | Mount path of the HTTP routes |
| `urlMerchantResponse` | callback route | Where SISP posts the payment result |
| `redirectUrl` | `'/'` | Fallback redirect for cancelled or unknown callbacks |
| `frontendResultUrl` | `null` | When set, a processed callback redirects the browser to `${frontendResultUrl}?ref=…` instead of the JSON result page, handing control to a SPA |
| `driver` | derived | `'production'`, `'sandbox'`, or a custom driver name |
| `sandbox` | `false` | Selects the sandbox driver when no explicit `driver` |
| `allowRetry` | `true` | Enables the retry flow for failed payments |
| `tables` | `sisp_*` | Override any of the package table names |

## Guards

```ts
rateLimiting: {
  enabled: true,
  perIp: { enabled: true, limit: 100, windowSeconds: 3600 },
  perMerchant: { enabled: true, limit: 500, windowSeconds: 3600 },
  perUser: { enabled: true, limit: 50, windowSeconds: 3600 },
}
```

## Reconciliation

```ts
transactionStatus: {
  url: 'https://comerciante.vinti4.cv/pos/transaction-status',
  portalId: '',
  portalPassword: '',
  timeoutSeconds: 10,
  reconciliationEnabled: false,
  reconcileAfterMinutes: 5,
  reconcileLimit: 50,
}
```

## Idempotency

```ts
idempotency: {
  enabled: true,
  requestKeys: ['idempotency_key', 'checkout_intent_id'],
}
```

The payment handler reads the first non-empty configured key from the request body. That key is stored in `sisp_payment_intents` and linked to the local transaction. Reposting the same checkout key reuses the same transaction instead of creating a duplicate.

Use one stable key per checkout intent. Do not use a timestamp as the idempotency key, because a new timestamp is generated on every click.

## Identifier generation

```ts
identifierGeneration: {
  maxAttempts: 5,
  collisionRetrySleepMs: 1000,
}
```

`merchantReference`, `merchantSession`, and retry attempts are protected by unique constraints. If a custom generator collides, the package retries with a new candidate until `maxAttempts` is reached. The default sleep is `1000` milliseconds, which is one second.

> SISP caps `merchantRef` and `merchantSession` at **15 characters**. Longer values are truncated by the gateway before it recomputes the request fingerprint, so the payment is rejected with `messageType=6 / Fingerprint Invalid` and the card page never loads. The built-in generators stay within 15 characters; keep any custom generator within the limit too.

## Extension points

| Key | Description |
|-----|-------------|
| `generators` | Replace `merchantReference`, `merchantSession`, or `timeStamp` factories |
| `pipelines.payment` | `(defaults) => pipes` to reorder, remove, or add payment pipes |
| `pipelines.callback` | Same for the callback pipeline |
| `onEventListenerError` | Receives errors thrown by event listeners |

```ts
const sisp = await createSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  url: process.env.SISP_URL,
  appKey: process.env.APP_KEY,
  baseUrl: 'https://app.example.cv',
  database: { client: 'pg', connection: process.env.DATABASE_URL },
  generators: {
    merchantReference: () => `R${Date.now()}`,
  },
});
```

Custom generators may keep using date-based values. The package does not require a specific format, but identifiers must stay within SISP's 15-character limit and pass the database uniqueness checks within the configured retry limit.

## No database at all

`createSisp` still requires either `storage` or `database`; that check has not changed. If you already own transaction tables and want the gateway protocol handled without the package persisting anything of its own, use `createStatelessSisp` instead. See [Stateless Mode](13-stateless-mode.md).

**Next:** [Quick Start](03-quick-start.md)
