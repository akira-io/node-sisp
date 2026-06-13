# Configuration

`createSisp(config)` accepts a single object. Only `posId`, `posAutCode`, and `database` are required; every other key mirrors `config/sisp.php` from the Laravel package and keeps the same default.

## Credentials and gateway

| Key | Default | Description |
|-----|---------|-------------|
| `posId` | required | Virtual POS terminal id issued by SISP |
| `posAutCode` | required | Virtual POS terminal password, source of every fingerprint |
| `url` | `''` | Gateway payment URL used by the production driver |
| `merchantId` | `''` | Merchant id issued by SISP |
| `currency` | `'132'` | ISO 4217 numeric code, Cabo Verde Escudo |
| `languageMessages` | `'EN'` | Language for gateway response messages |
| `fingerprintVersion` | `'1'` | Payment request fingerprint version |
| `is3DSec` | `'0'` | Set `'1'` to require 3-D Secure customer data |
| `transactionCode` | `'1'` | Default transaction type (purchase) |

## Application wiring

| Key | Default | Description |
|-----|---------|-------------|
| `database` | required | `{ client, connection, autoMigrate }` passed to knex |
| `appKey` | `null` | Key for payload encryption (AES-256-GCM) and signed URLs |
| `baseUrl` | `''` | Absolute origin used when building route URLs |
| `basePath` | `'/sisp'` | Mount path of the HTTP routes |
| `urlMerchantResponse` | callback route | Where SISP posts the payment result |
| `redirectUrl` | `'/'` | Fallback redirect for cancelled or unknown callbacks |
| `driver` | derived | `'production'`, `'sandbox'`, or a custom driver name |
| `sandbox` | `false` | Selects the sandbox driver when no explicit `driver` |
| `allowRetry` | `true` | Enables the retry flow for failed payments |
| `tables` | `sisp_*` | Override any of the seven table names |

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

**Next:** [Quick Start](03-quick-start.md)
