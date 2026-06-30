# Listing transactions

`Transaction.list()` returns hydrated records (amount derived from `amount_cents`, payload decrypted), bounded by the shared list limit and newest-first by default.

```ts
const recent = await sisp.models.transactions.list({ limit: 50 });

for (const transaction of recent) {
  console.log(transaction.merchant_ref, transaction.status, transaction.amount);
}
```

Filter by status and page with `offset`:

```ts
const failed = await sisp.models.transactions.list({ status: 'failed', limit: 20, offset: 0 });
const oldestFirst = await sisp.models.transactions.list({ order: 'asc' });
```

| Option | Default | Description |
|--------|---------|-------------|
| `status` | any | Filter by transaction status |
| `limit` | 100 | Bounded by the package list limit |
| `offset` | 0 | Pagination offset |
| `order` | `desc` | `asc` or `desc` by id |

For a single transaction, use `findByRef`, `findById`, or `findByRefAndSession`. Prefer `list()` over raw queries: a raw `select('*')` returns `amount_cents` without the hydrated `amount` and keeps the payload encrypted.

**Next:** [Decoupled SPA: Vue and Svelte](06-spa-frameworks.md)
