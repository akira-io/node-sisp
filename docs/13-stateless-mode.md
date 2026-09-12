# Stateless Mode

## When to use it

Use `createStatelessSisp` when you already own transaction tables and want the gateway protocol handled without the package persisting anything of its own. It builds signed gateway payloads, verifies callbacks, and emits events; you persist whatever you want in your own schema. `createSisp` stays exactly as it is and still requires `storage` or `database`.

## Quick start

Without a correlation store, the package never mounts `POST /payment`. You build and render the payment yourself, and you tell the package what each callback should be worth, either per call (`handleCallback(payload, { amount })`) or through the `expectedPayment` lookup that the HTTP route uses:

```ts
import { createStatelessSisp } from '@akira-io/sisp';

const sisp = createStatelessSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  appKey: process.env.SISP_APP_KEY,
  baseUrl: 'https://app.example.cv',
  sandbox: true,
  expectedPayment: async (payload) => {
    const order = await orders.findByMerchantRef(payload.merchantRef);

    return order ? { amount: order.amount, currency: '132' } : null;
  },
});

const request = sisp.payment().amount(1500).build();
// render `request` into your own auto-submit form
```

A `completed` callback with no expected payment to compare against is rejected with `expected_payment_missing`. The SISP fingerprint concatenates fields without separators, so a signed callback can be re-cut across the `merchantSession`/`amount` boundary (`'S...x7' + '1500'` signs the same bytes as `'S...x' + '71500'`); only an amount expectation of your own closes that. Declines and pending callbacks are still verified on the fingerprint alone, because nothing is fulfilled from them.

With a `correlation` store, `POST /payment` and `POST /payment/intent` mount automatically and callback verification gains replay protection and amount/currency/code matching:

```ts
import { createStatelessSisp } from '@akira-io/sisp';
import { statelessSispRoutes } from '@akira-io/sisp/express';

const sisp = createStatelessSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  appKey: process.env.SISP_APP_KEY,
  baseUrl: 'https://app.example.cv',
  sandbox: true,
  correlation: new KnexOrdersCorrelationStore(db),
});

app.use('/sisp', statelessSispRoutes(sisp));
```

## `verified` is authenticity, not a payment verdict

`verified` means the callback's fingerprint checked out and its amount/currency/transaction code matched what you expected: the `correlation` record, the `expected` argument, or the `expectedPayment` lookup. It says nothing about whether the gateway approved or declined the payment. A correctly signed decline is still `verified: true`, because nothing about a decline breaks the fingerprint, and the amount is not compared against a callback that does not send one - an error response never does:

```
{ merchant_ref: 'R123', verified: true, status: 'failed', reason: null, error: { code: 'F', description: '...', detail: '...', customerMessage: 'FALHA NA AUTENTICACAO CLIENTE' } }
```

### What survives the signed result URL

That shape is what `handleCallback` returns and what the `callback:verified` event carries. When `appKey` is configured, the HTTP handler instead redirects to a signed result URL, and `GET` on it carries only the customer-facing half of the error - `code` and `customerMessage`. `description` and `detail` come back empty:

```
{ code: 'F', description: '', detail: '', customerMessage: 'FALHA NA AUTENTICACAO CLIENTE' }
```

`description` and `detail` are gateway diagnostics; `customerMessage` is `merchantRespAdditionalErrorMessage`, which the specification defines as the message to show the end customer. Keeping the diagnostics out of the URL keeps them out of access logs, `Referer` headers and browser history. Read them from the event payload if you need them. Stateful mode does not lose them, because it reads the stored callback back from the attempt.

A callback that did not verify carries no error fields at all. Its `errorCode` and `additionalErrorMessage` are attacker-controlled text on an unauthenticated POST, so they never reach the signed URL; you get `reason` instead.

`status` is withheld the same way, and for the same reason. It is derived from `messageType`, which is attacker-controlled text on that same unauthenticated POST, so a rejected outcome reports `status: null` rather than the verdict its payload asked for, and the signed URL carries no `status` parameter at all:

```
{ merchant_ref: 'R123', verified: false, status: null, reason: 'invalid_callback_fingerprint', error: null }
```

### Where the customer lands

`GET` on the signed result URL answers with JSON, not a redirect. That is the end of the package's involvement: the customer's browser stops on your API. Build your own page over the signed result if you want them back in the shop. Cancellation is the exception and redirects to `redirectUrl` directly, because there is no signed result to hand over.

Check `status` for the gateway's verdict instead:

```ts
const outcome = await sisp.handleCallback(payload);

if (outcome.verified && outcome.status === TransactionStatus.Completed) {
  fulfilOrder(outcome.payload.merchantRef);
}
```

The same applies to the `callback:verified` event: it fires on every authentic, matching callback, declines included. Do not fulfil an order from the event name alone; read `event.status`:

```ts
import { TransactionStatus } from '@akira-io/sisp';

sisp.on('callback:verified', (event) => {
  if (event.status === TransactionStatus.Completed) {
    fulfilOrder(event.payload.merchantRef);
  }
});
```

`GET /callback`, the signed stateless result, and `StatelessPaymentResponseData` all carry the same `status` field, derived from `mapTransactionStatus` whenever the callback verified and `null` whenever it did not. This applies equally to stateful `Sisp`: `outcome.transaction.status` already exposed the gateway verdict there, and `outcome.status` mirrors it on the return value of `handleCallback` and on the `callback:*` events too, so the same check works unchanged after [growing into stateful](#growing-into-stateful). A replayed stateful callback is a rejected outcome, so its `outcome.status` is `null` too; the verdict of the callback that was already processed is on `outcome.transaction.status`.

Cancellation is the one rejected outcome that still carries a status. `TransactionStatus.Cancelled` there comes from the package noticing `UserCancelled`, not from anything the payload claimed.

## The correlation port

```ts
export interface ExpectedPayment {
  amount: string | number;
  currency?: string;
  transactionCode?: string;
}

export type CorrelationClaim =
  | { status: 'claimed'; payment: ExpectedPayment }
  | { status: 'missing' }
  | { status: 'already_processed' };

export interface PaymentCorrelationStore {
  record(request: PaymentRequest): Promise<void>;
  claim(merchantRef: string, merchantSession: string): Promise<CorrelationClaim>;
  markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void>;
}
```

Three methods against the 45 of the full `SispStorage` port.

`claim` must be atomic: it reserves the row and reports its prior state in one indivisible step. A read-then-write pair does not satisfy the contract, because two concurrent deliveries of the same callback would both pass the replay check, and gateways do reissue callbacks on timeout. In SQL it is a single statement:

```sql
UPDATE orders SET sisp_claimed_at = now()
WHERE merchant_ref = $1 AND merchant_session = $2 AND sisp_claimed_at IS NULL
RETURNING amount, currency, transaction_code
```

Zero rows back means the pair either does not exist or was already claimed; distinguish the two with a follow-up existence check, which is safe because a claimed row never becomes unclaimed.

`markProcessed` runs after verification completes, on success and on failure alike, recording the outcome on the row `claim` already reserved.

The gateway fingerprint is verified first; `claim` runs after, inside the pipe that matches amount, currency, and transaction code against the original request. Claiming before that amount/currency/code match makes callback handling at-most-once rather than at-least-once: a process that dies between `claim` and `markProcessed` leaves a claimed row with no recorded outcome, and that callback cannot be reprocessed. Matching first and claiming after would reopen the concurrency hole, so this is the deliberate trade. If you need recovery from a mid-callback crash, add a claim expiry in your own schema; the package does not model leases.

### Knex, against a consumer-owned `orders` table

```ts
import type { Knex } from 'knex';
import type {
  CallbackOutcome,
  CorrelationClaim,
  PaymentCorrelationStore,
  PaymentRequest,
} from '@akira-io/sisp';

export class KnexOrdersCorrelationStore implements PaymentCorrelationStore {
  constructor(private readonly db: Knex) {}

  async record(request: PaymentRequest): Promise<void> {
    await this.db('orders').insert({
      merchant_ref: request.merchantRef,
      merchant_session: request.merchantSession,
      amount: request.amount,
      currency: request.currency,
      transaction_code: request.transactionCode,
      sisp_claimed_at: null,
      sisp_outcome: null,
    });
  }

  async claim(merchantRef: string, merchantSession: string): Promise<CorrelationClaim> {
    const claimed = await this.db('orders')
      .where({
        merchant_ref: merchantRef,
        merchant_session: merchantSession,
        sisp_claimed_at: null,
      })
      .update({ sisp_claimed_at: this.db.fn.now() })
      .returning(['amount', 'currency', 'transaction_code']);

    if (claimed.length > 0) {
      const row = claimed[0];

      return {
        status: 'claimed',
        payment: {
          amount: row.amount,
          currency: row.currency,
          transactionCode: row.transaction_code,
        },
      };
    }

    const existing = await this.db('orders')
      .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
      .first();

    return existing === undefined ? { status: 'missing' } : { status: 'already_processed' };
  }

  async markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void> {
    await this.db('orders')
      .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
      .update({ sisp_outcome: outcome.verified ? 'verified' : outcome.reason });
  }
}
```

### Prisma, against the same table

```ts
import type { PrismaClient } from '@prisma/client';
import type {
  CallbackOutcome,
  CorrelationClaim,
  PaymentCorrelationStore,
  PaymentRequest,
} from '@akira-io/sisp';

interface ClaimedRow {
  amount: number;
  currency: string;
  transaction_code: string;
}

export class PrismaOrdersCorrelationStore implements PaymentCorrelationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async record(request: PaymentRequest): Promise<void> {
    await this.prisma.order.create({
      data: {
        merchantRef: request.merchantRef,
        merchantSession: request.merchantSession,
        amount: request.amount,
        currency: request.currency,
        transactionCode: request.transactionCode,
        sispClaimedAt: null,
        sispOutcome: null,
      },
    });
  }

  async claim(merchantRef: string, merchantSession: string): Promise<CorrelationClaim> {
    const claimed = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "Order" SET "sispClaimedAt" = now()
      WHERE "merchantRef" = ${merchantRef} AND "merchantSession" = ${merchantSession}
        AND "sispClaimedAt" IS NULL
      RETURNING amount, currency, "transactionCode" AS transaction_code
    `;

    if (claimed.length > 0) {
      const row = claimed[0];

      return {
        status: 'claimed',
        payment: {
          amount: row.amount,
          currency: row.currency,
          transactionCode: row.transaction_code,
        },
      };
    }

    const existing = await this.prisma.order.findUnique({
      where: { merchantRef_merchantSession: { merchantRef, merchantSession } },
    });

    return existing === null ? { status: 'missing' } : { status: 'already_processed' };
  }

  async markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void> {
    await this.prisma.order.update({
      where: { merchantRef_merchantSession: { merchantRef, merchantSession } },
      data: { sispOutcome: outcome.verified ? 'verified' : outcome.reason },
    });
  }
}
```

## Routes

| Route | Mounted when | Behaviour |
|---|---|---|
| `POST /payment` | `correlation` present | validate input, build `PaymentRequest`, `await correlation.record(request)`, render auto-submit form |
| `POST /payment/intent` | `correlation` present | same, returns `{ action, fields, ref }` as JSON for SPA clients |
| `POST /callback` | always | verifier; redirects to the signed result URL when `appKey` is configured, otherwise returns the result as JSON |
| `GET /callback` | `appKey` present | validate signature, return the result as JSON |
| `GET /countries` | always | `allCountries()` |
| `POST /sandbox`, `GET /sandbox` | `sandbox: true` | unchanged |

Refund, retry, cancel, transactions and transaction-status routes do not exist in stateless mode. Express (`statelessSispRoutes`) and Fastify (`statelessSispFastifyPlugin`) mount the conditional routes above and 404 on anything else, which is honest: there is no 501 pretending a capability exists.

**Nest is the exception.** Decorators cannot be applied conditionally, so `StatelessSispModule.forRoot({ sisp })` and the controller it builds declare every stateless route unconditionally. `POST /payment` raises `CorrelationRequiredError` (a 500) when no `correlation` store is configured, and `GET /callback` redirects to `redirectUrl` instead of returning a signed result when no `appKey` is configured. If you mount `StatelessSispModule` under Nest, configure both `correlation` and `appKey`, or do not mount the module at all.

The adapter names: `statelessSispRoutes` (Express), `statelessSispFastifyPlugin` (Fastify), `StatelessSispModule` / `createStatelessSispController` / `STATELESS_SISP` (Nest), mirroring the stateful `sispRoutes`, `sispFastifyPlugin`, and `SispModule`.

The cancellation flag, spelled `userCancelled` in the specification table and `UserCancelled` in SISP's PHP sample, is read in either casing from the request body or query before any fingerprint check, in both stateless and stateful mode. SISP does not sign this field, so there is no fingerprint to verify it against; that part of the design cannot change. What both modes do instead is bind the `callback:rejected` event to a payment the consumer actually created, so a bare `UserCancelled=true` cannot forge the event on its own.

In stateless mode, `rejectCancelled` calls `correlation.claim(merchantRef, merchantSession)` before emitting anything. `callback:rejected` fires only when the claim comes back `claimed` - meaning a `record()` call earlier in the same flow put that exact pair there - and the pair is then marked processed via `markProcessed`, so a replayed cancellation for the same pair claims `already_processed` and does not emit a second time. When `claim` returns `missing` or `already_processed`, the handler still redirects to `redirectUrl`, it just does not emit. **Without a `correlation` store configured, there is nothing to claim against, so `rejectCancelled` never emits `callback:rejected` for a cancellation at all** - it only ever redirects. If your integration needs to react to user cancellations in stateless mode, configure `correlation`.

In stateful mode, `CallbackHandlers.handleUserCancelled` calls `cancelUserCancelledTransaction`, which looks the transaction up by `merchantRef`/`merchantSession` and cancels it through `CancelTransactionAction`. `callback:rejected` fires only when that lookup found a transaction and the cancellation succeeded; an unknown pair or a transaction that is already `completed`/`cancelled` (which `CancelTransactionAction` refuses to touch) redirects without emitting.

The residual exposure is the same in both modes: whoever knows a valid `merchantRef`/`merchantSession` pair for a still-pending payment can cancel it early by sending `UserCancelled=true` with that pair, ahead of the real gateway callback. That is inherent to a field SISP does not sign - the fix closes forgery of *arbitrary* references, not cancellation of a *correctly guessed* one. In practice guessing a live pair is not feasible: `generateMerchantSession` produces `'S'` followed by the base36 millisecond timestamp and roughly five characters drawn from `crypto.randomInt` over a 36-symbol alphabet, and `merchantRef` is generated per payment the same way - neither is derived from anything an outside party observes.

## Security posture

| Protection | Stateful | Stateless + `correlation` | Stateless without `correlation` |
|---|---|---|---|
| Gateway fingerprint | yes | yes | yes |
| Amount/currency/code vs original request | yes | yes | yes, from `expected` or `expectedPayment`; a `completed` callback without either is rejected |
| Replay of the same callback, sequential | yes | yes | no |
| Replay of the same callback, concurrent | yes | yes, if `claim` is atomic | no |
| Submission idempotency | yes | no, consumer middleware | no, consumer middleware |
| Rate limiting, blacklist | yes | no, consumer middleware | no, consumer middleware |

> Without a `correlation` store, callback replay is your responsibility to guard against. Amount tampering is not: a `completed` callback only verifies against an expected amount you supply.

Rate limiting, blacklisting, and submission idempotency are absent from stateless mode on purpose: they are perimeter concerns that your framework's own middleware already solves (`express-rate-limit`, Fastify hooks, Nest guards), none of which need the package's tables. Submission idempotency specifically cannot work here even if the package tried: it needs the idempotency key from your request body, and `record()` writes a row keyed by a freshly generated `merchantRef`/`merchantSession` that is new on every submission, so there is nothing to deduplicate against.

The signed `GET /callback` result URL expires 5 minutes after it is issued. Every field in it is already inside the signature, so an expired URL is not a forgery risk, but without an expiry it would be a standing bearer assertion: once it sits in a customer's browser history or a `Referer` header, replaying it would keep confirming the callback's authenticity indefinitely, regardless of what the transaction's status was by the time someone replayed it. A short TTL bounds that window to the immediate redirect the URL is built for.

`ScopedSisp` (multi-merchant, stateful-only) now emits `callback:*` through the shared verifier as well; previously it emitted no callback events at all.

## Growing into stateful

1. Swap `createStatelessSisp(cfg)` for `createSisp({ ...cfg, database: { client, connection } })`. `StatelessSispConfig` is a subset of `SispConfig` minus `correlation`.
2. Generate migrations: `autoMigrate: true` on knex, or `npx @akira-io/sisp prisma` plus `prisma migrate` on Prisma.
3. Swap the router too: `statelessSispRoutes` for `sispRoutes`, `statelessSispFastifyPlugin` for `sispFastifyPlugin`, `StatelessSispModule.forRoot` for `SispModule.forRoot`. This is the step that fails quietly if you skip it. The stateless router mounts only the stateless route set, so `refund`, `retry`, `cancel`, `transactions` and `transaction-status` keep answering 404 on an app that now has a database behind it, and nothing tells you why.
4. Nothing else. Types keep compiling because `Sisp extends StatelessSisp`, the shared routes keep their paths and contracts, and `callback:*` listeners keep firing without an edit.

Three caveats, all inherent and none of them scriptable:

- `correlation` goes dead. The package stops calling it, and this is wider than it sounds: anything you built on top of that table stops being fed. If your checkout polls your own orders table to show the payment result, it will poll a row that is no longer updated, because the outcome now lands in `sisp_transactions`. Point those reads at the package's own records, or keep writing your table from the `callback:*` listeners you already have.
- No backfill. Transactions written to your table before the switch are invisible to `sisp_transactions`, so `refund`, `cancel`, and `reconcilePending` will not work on them. The package cannot guess your column mapping.
- Submission idempotency, rate limiting, and blacklisting start working once you switch, which may duplicate middleware you already added for stateless mode.

**Previous:** [Storage Adapters](12-storage-adapters.md) | **Next:** [Index](00-index.md)
