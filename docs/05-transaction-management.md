# Transaction Management

## Querying transactions

```ts
const transaction = await sisp.models.transactions.findByRef('R20260612100000');
const items = await sisp.models.transactionItems.listByTransaction(transaction.id);
const logs = await sisp.models.transactionLogs.listByTransaction(transaction.id);
```

Every update appends a row to `sisp_transaction_logs` with the source (`callback`, `refund`, `cancel`, `retry`, `reconciliation`, `customer-data`, or `model`), the changed attributes, and old plus new values. Timestamp-only updates are ignored.

## Retry

Failed payments can be retried through a signed URL that expires after 30 minutes:

```ts
const url = sisp.signedRetryUrl(transaction.id);
```

`GET` renders the payment form again without touching the transaction. `POST` resets it to pending, rotates the `merchantSession`, clears the gateway response fields, and renders a freshly signed form. Retry is refused when `allowRetry` is off, the transaction is not failed, or 3-D Secure data is missing while `is3DSec` is `'1'`.

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
