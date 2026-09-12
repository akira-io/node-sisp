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
| `appKey` | `null` | Key for payload encryption (AES-256-GCM) and signed URLs. Required by `createSisp` to persist payloads; at least 32 characters outside sandbox mode |
| `baseUrl` | `''` | Absolute origin used when building route URLs |
| `basePath` | `'/sisp'` | Mount path of the HTTP routes. Normalized to a leading slash and no trailing slash, so `pay`, `/pay` and `/pay/` all resolve to `/pay` |
| `urlMerchantResponse` | callback route | Where SISP posts the payment result |
| `redirectUrl` | `'/'` | Fallback redirect for cancelled or unknown callbacks |
| `frontendResultUrl` | `null` | When set, a processed callback redirects the browser to `${frontendResultUrl}?ref=…` instead of the JSON result page, handing control to a SPA |
| `driver` | derived | `'production'`, `'sandbox'`, or a custom driver name |
| `sandbox` | `false` | Selects the sandbox driver when no explicit `driver`. Refused when `NODE_ENV` is `production` unless `allowSandboxInProduction` is `true` |
| `allowSandboxInProduction` | `false` | Opt-in to keep the public `/sandbox` route with `NODE_ENV=production` |
| `allowWeakAppKey` | `false` | Accept an `appKey` shorter than 32 characters outside sandbox mode, for installations that still have to rotate |
| `idempotency.excludeFromHash` | `_token`, `_csrf`, `_method`, `csrf_token`, `authenticity_token` | Body fields left out of the idempotency request hash, on top of `idempotency.requestKeys` |
| `allowRetry` | `true` | Enables the retry flow for failed payments |
| `tables` | `sisp_*` | Override any of the package table names |

## Guards

```ts
rateLimiting: {
  enabled: true,
  perIp: { enabled: true, limit: 100, windowSeconds: 3600 },
  perIpStatus: { enabled: true, limit: 3600, windowSeconds: 3600 },
  perMerchant: { enabled: false, limit: 500, windowSeconds: 3600 },
  perUser: { enabled: true, limit: 50, windowSeconds: 3600 },
},
security: {
  collectMetadata: true,
  clientIp: (request) => headerValue(request, 'x-real-ip'),
},
```

`rateLimiting` guards the payment pipeline with three fixed windows, checked in order: `perIp`, then `perMerchant`, then `perUser`. The first window that is exceeded raises HTTP 429 and the remaining windows record no hit for that request, so the scopes are ordered, not independent. A rule with `enabled: false` is skipped entirely, and `enabled: false` at the top level turns off all three. The refund route applies only `perIp`, and the transaction-status route only `perIpStatus`, each on its own bucket.

`perIp` keys on the resolved client IP. `perMerchant` keys on the `posId` of the `Sisp` instance handling the request, so it caps that merchant regardless of how many addresses the traffic arrives from; it is **off by default**, because exceeding it blocks every payment for the merchant until the window ends. `perUser` keys on an HMAC-SHA-256 of the customer email, using `appKey` as the key, and falls back to the customer phone when no email is present; the value is trimmed and lowercased before hashing, and the scope is skipped when the request carries neither field. A customer who sends an email on one request and only a phone on the next occupies two buckets.

`perIpStatus` covers `GET /transactions/:ref`, which a checkout page polls while it waits for the gateway. It keys on the same resolved client IP as `perIp` but counts into its own bucket, so polling never exhausts the payment budget: at the default of 3600 per hour, one request per second stays inside it, and behind a NAT address every client on it no longer spends from the payment allowance. Lower the limit when the checkout polls slowly, raise `windowSeconds` to spread the same budget over longer sessions, or set `perIpStatus.enabled` to `false` to leave status lookups unlimited.

`security.collectMetadata` set to `false` drops `CaptureRequestMetadata` from the payment pipeline and stops the callback handler from writing to `sisp_request_metadata`, so no IP, user agent, header, or device-fingerprint row is created. Leave it `true` unless a data-protection requirement says otherwise; the reconciliation and audit trails do not depend on it.

`security.clientIp` resolves the address used for per-IP rate limits, the IP blacklist, and request metadata. Without it the package uses the adapter's `req.ip`, which behind a reverse proxy is the proxy's address unless the framework is told to trust it (`app.set('trust proxy', ...)` in Express, `trustProxy` in Fastify). When the resolver returns `null` or an empty string the package falls back to the adapter's `req.ip`; per-IP limits and blacklist checks are skipped only when that is empty too, instead of sharing one bucket.

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
