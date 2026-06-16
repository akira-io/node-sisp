# Idempotency and Attempts

SISP requires dynamic payment identifiers. `merchantRef` identifies the merchant transaction, and `merchantSession` identifies the customer session used in the fingerprint. Both values must be unique enough for reconciliation and callback validation.

This package adds two layers around those identifiers:

- `sisp_payment_intents` prevents a user retry from creating a second transaction for the same checkout.
- `sisp_transaction_attempts` records every gateway submission for audit, callback matching, and late callback handling.

## Why this exists

A common failure mode is a checkout that submits a payment, the gateway or browser flow fails, and the customer retries. Without idempotency, the second POST can create a new local transaction with the same order data. That produces duplicate rows, ambiguous reconciliation, and callbacks that can update the wrong state.

Another failure mode comes from custom identifier generators. The package lets applications provide their own `merchantReference`, `merchantSession`, and `timeStamp` factories. If those factories collide, the database uniqueness constraints must reject the duplicate and the package must retry with a new candidate.

## Request keys

Idempotency is enabled by default.

```ts
const sisp = await createSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  database: { client: 'pg', connection: process.env.DATABASE_URL },
  idempotency: {
    enabled: true,
    requestKeys: ['idempotency_key', 'checkout_intent_id'],
  },
});
```

The HTTP payment handler reads the first non-empty configured key from the request body. Send a stable value for the checkout intent:

```html
<input type="hidden" name="checkout_intent_id" value="order_123_payment_1">
```

Use the same key when the same checkout is posted again. Use a new key when the customer starts a new checkout.

## Payment intent lifecycle

The `sisp_payment_intents` table has one row per idempotency key.

| Status | Meaning |
|--------|---------|
| `processing` | A request reserved the key and is creating or replaying the payment. |
| `submitted` | The key is linked to a local transaction and can be replayed safely. |
| `failed` | The package caught an error while handling the key. |

When a request arrives:

1. The package reserves the idempotency key.
2. If the key is new, the payment pipeline creates a transaction and the first attempt.
3. If the key already points to a transaction, the handler reuses that transaction.
4. If the transaction is retryable, the handler creates a new attempt on the same transaction.
5. If the transaction is not retryable, the handler rebuilds the original payment request from the stored attempt payload.

Failed intents are recoverable when no transaction was created. The next request with the same key reclaims the row and tries again. If the first request created a transaction before a later pipe failed, the next request reuses that transaction instead of creating an orphan.

## Transaction attempts

Each gateway submission is stored in `sisp_transaction_attempts`.

Important fields:

| Field | Purpose |
|-------|---------|
| `transaction_id` | Parent transaction. |
| `attempt_number` | Sequential number per transaction. |
| `merchant_ref` | Merchant reference sent to SISP. |
| `merchant_session` | Merchant session sent to SISP. |
| `status` | Attempt status after callback or retry. |
| `gateway_transaction_id` | SISP transaction id from the callback. |
| `payload` | Signed payment request fields. |
| `callback_payload` | Callback data received from SISP. |
| `superseded_at` | Set when a retry replaces this attempt. |

On a normal first payment, the package creates attempt `1`. On retry, it marks the current attempt as superseded, rotates the `merchantSession`, clears the gateway response fields on the parent transaction, and creates attempt `2`.

`merchantRef` stays stable for the parent transaction. `merchantSession` changes per retry attempt.

## Late callbacks

SISP can retry callbacks. A callback can also arrive after a customer has retried the payment.

Callbacks are resolved by `merchantRef` plus `merchantSession` against `sisp_transaction_attempts`. This lets the package identify the exact gateway submission that produced the callback.

Propagation rules:

| Callback target | Callback status | Parent transaction update |
|-----------------|-----------------|---------------------------|
| Current attempt | Any mapped status | Propagates. |
| Superseded attempt | Completed | Propagates. A successful payment must win. |
| Superseded attempt | Failed or pending | Does not propagate. The active retry remains pending. |

The attempt update and parent transaction update run inside one database transaction. If either write fails, both roll back and SISP can retry the callback.

## Identifier collisions

The package protects `merchantRef`, `merchantSession`, and attempt numbering with unique constraints. When a collision occurs during payment creation or retry, the package retries the candidate generation.

```ts
const sisp = await createSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  database: { client: 'mysql2', connection: mysqlConfig },
  identifierGeneration: {
    maxAttempts: 5,
    collisionRetrySleepMs: 1000,
  },
});
```

`collisionRetrySleepMs` defaults to `1000`, which is one second. Set it to `0` in tests if you need collision retries without waiting.

If all candidates collide, the package throws `UnableToGenerateUniquePaymentIdentifiersError`.

## Practical integration

Applications should generate the checkout key before posting to `/sisp/payment`.

Recommended sources:

| App concept | Idempotency key |
|-------------|-----------------|
| Order payment | Stable order payment id. |
| Cart checkout | Checkout intent id stored in the session or database. |
| Invoice payment | Invoice id plus payment sequence. |

Do not use `Date.now()` as the idempotency key. A timestamp changes on each click, which disables idempotency.

Do not reuse one key for different orders. The package will return or retry the first transaction linked to that key.

## Disabling idempotency

```ts
const sisp = await createSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  database,
  idempotency: { enabled: false },
});
```

Only disable it for controlled tests or for an application that already enforces an equivalent checkout lock before calling the package. The database still enforces identifier uniqueness.

**Next:** [Index](00-index.md)
