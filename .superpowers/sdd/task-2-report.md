# Task 2 Report: Storage Contract Suite

## Commit

`70b0253` — `test(storage): add reusable storage contract suite`

## Files Created

- `tests/storage/contract.ts` — exports `runStorageContract(makeStorage)`
- `tests/storage/knex.test.ts` — red runner for Task 3

## Behaviors Covered

| Describe block | Behavior |
|---|---|
| `transactions.create / findById` | Creates a transaction with `{merchantRef, merchantSession, amount}`, reads it back by id, asserts `id`, `amount`, `status: 'pending'`. Also asserts `findById` returns `null` for a missing id. |
| `transaction() unit-of-work rollback` | Creates a transaction, runs `storage.transaction()` that calls `unit.transactions.update(id, {status:'completed'})` then throws `'boom'`. Asserts the call rejects and the row's status is still `'pending'`. |
| `transactions.list` | Seeds 5 transactions, calls `list({limit:3})`, asserts at most 3 rows returned and they are newest-first (`REF-LIST-4`, `REF-LIST-3`, `REF-LIST-2`). |
| `transactions.findByIdForUpdate` | Returns the row when it exists (asserts `id` and `status`). Returns `null` for a missing id. |

## Typecheck Result

`npm run typecheck` — **passed** (zero errors, zero diagnostics).

## Failing Test Output (expected red state)

```
 ❯ tests/storage/knex.test.ts (6 tests | 6 failed) 4ms
   × KnexStorage > transactions.create / findById > persists and retrieves a transaction by id 2ms
     → KnexStorage not implemented yet
     → Cannot read properties of undefined (reading 'destroy')
   × KnexStorage > transactions.create / findById > returns null for a missing id 0ms
     → KnexStorage not implemented yet
   × KnexStorage > transaction() unit-of-work rollback > rolls back changes when the callback throws 0ms
     → KnexStorage not implemented yet
   × KnexStorage > transactions.list > bounds result count and returns newest first 0ms
     → KnexStorage not implemented yet
   × KnexStorage > transactions.findByIdForUpdate > returns the row when it exists 0ms
     → KnexStorage not implemented yet
   × KnexStorage > transactions.findByIdForUpdate > returns null for a missing id 0ms
     → KnexStorage not implemented yet

Error: KnexStorage not implemented yet
 ❯ tests/storage/knex.test.ts:7:11
```

All 6 tests fail because `makeStorage()` throws `'KnexStorage not implemented yet'` before returning a storage instance. The secondary `destroy` error on `undefined` is a consequence of that throw. This is the correct red state for Task 3 to implement the real knex adapter against.
