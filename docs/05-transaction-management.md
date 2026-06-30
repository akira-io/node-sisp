# Transaction Management

## Querying transactions

```ts
const transaction = await sisp.models.transactions.findByRef('R20260612100000');
const items = await sisp.models.transactionItems.listByTransaction(transaction.id);
const attempts = await sisp.models.transactionAttempts.listByTransaction(transaction.id);
const logs = await sisp.models.transactionLogs.listByTransaction(transaction.id);
```

Every update appends a row to `sisp_transaction_logs` with the source (`callback`, `refund`, `cancel`, `retry`, `reconciliation`, `customer-data`, or `model`), the changed attributes, and old plus new values. Timestamp-only updates are ignored.

## Listing transactions

`sisp.models.transactions.list()` returns hydrated records (the `amount` field derived from `amount_cents`, payload decrypted) bounded by the configured list limit and newest-first by default.

```ts
const recent = await sisp.models.transactions.list({ limit: 50 });

const failed = await sisp.models.transactions.list({ status: 'failed', limit: 20, offset: 0 });
const oldestFirst = await sisp.models.transactions.list({ order: 'asc' });
```

| Option | Default | Description |
|--------|---------|-------------|
| `status` | any | Filter by transaction status |
| `limit` | 100 | Bounded by the package list limit |
| `offset` | 0 | Pagination offset |
| `order` | `'desc'` | `'asc'` or `'desc'` by id |

Prefer `list()` over raw queries: a raw `select('*')` returns `amount_cents` without the hydrated `amount` and keeps the payload encrypted.

## Attempts

`sisp_transaction_attempts` stores every payment request submitted to SISP. The parent transaction keeps the current effective state. Attempts keep the per-submission state.

```ts
const attempts = await sisp.models.transactionAttempts.listByTransaction(transaction.id);
const current = attempts.find((attempt) => attempt.superseded_at === null);
```

The first payment creates attempt `1`. A retry marks the current attempt as superseded, creates the next attempt, and rotates `merchantSession`. The `merchantRef` stays stable so reconciliation still points to the same merchant transaction.

Late callbacks are matched to attempts, not only to the parent transaction. A completed callback from an old attempt updates the parent transaction. A failed callback from an old superseded attempt stays on that attempt and does not overwrite the active retry.

## Retry

Failed payments can be retried through a signed URL that expires after 30 minutes:

```ts
const url = sisp.signedRetryUrl(transaction.id);
```

`GET` renders the payment form again without touching the transaction. `POST` resets it to pending, creates a new attempt, rotates the `merchantSession`, clears the gateway response fields, and renders a freshly signed form. Retry is refused when `allowRetry` is off, the transaction is not failed, or 3D Secure data is missing while `is3DSec` is `'1'`.

When a failed transaction has no attempt row because it predates the attempts migration, the retry flow backfills attempt `1` first. Concurrent retry requests tolerate the unique-constraint race and continue with the attempt created by the other request.

## Cancel

```ts
await sisp.cancel(transaction, 'changed_mind');
const url = sisp.signedCancelUrl(transaction.merchant_ref);
```

Allowed from `pending` and `failed`. Sets `cancelled_at`, records the reason, and emits `transaction:cancelled`. The signed route redirects to the result page.

## Refund

```ts
await sisp.refund(transaction).full().reason('customer_request').process();
await sisp.refund(transaction).amount(500).process();
```

Only `completed` transactions can be refunded, and never beyond the locally tracked balance. Each refund builds a version 2 signed reversal request (total reversal `4`, partial `8`) that requires the `clearingPeriod` and `transactionID` captured from the original callback, and appends it to the refund history inside the encrypted payload. A full refund moves the status to `refunded`; partials keep it `completed` until the balance hits zero. Emits `transaction:refunded`.

Over HTTP, `POST /refund/:transaction` is denied unless the adapter receives an `authorizeRefund` hook.

## Reconciliation

For pending transactions whose callback never arrived, SISP offers a POS transaction-status API authenticated with portal credentials:

```ts
const status = await sisp.queryTransactionStatus('R20260612100000');
await sisp.reconcileTransactionStatus(transaction);

const result = await sisp.reconcilePending({ limit: 50 });
// { skipped: false, checked: 12, reconciled: 9 }
```

`reconcilePending` targets pending transactions without a `messageType` older than `reconcileAfterMinutes`, oldest first, capped at `reconcileLimit`. Local state only changes when the gateway answers `result: true`. Schedule it from your own cron, or run the CLI:

```bash
npx sisp reconcile-pending --older-than 5 --limit 50 --force
```

## Multi-merchant scoping

```ts
const scoped = sisp.forCredentials({ posId: '70001', posAutCode: 'other-code', sandbox: true });

scoped.payment().amount(1000).build();
await scoped.queryTransactionStatus('R1');
await scoped.handlePaymentCallback(payload);
```

The scoped facade shares the database and the event emitter but signs and validates everything with the given credentials.

**Next:** [Adapters](06-adapters.md)
