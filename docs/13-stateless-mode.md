# Stateless Mode

## When to use it

Use `createStatelessSisp` when you already own transaction tables and want the gateway protocol handled without the package persisting anything of its own. It builds signed gateway payloads, verifies callbacks, and emits events; you persist whatever you want in your own schema. `createSisp` stays exactly as it is and still requires `storage` or `database`.

## Quick start

Without a correlation store, the package never mounts `POST /payment` and verification is fingerprint-only. You build and render the payment yourself:

```ts
import { createStatelessSisp } from '@akira-io/sisp';

const sisp = createStatelessSisp({
  posId: process.env.SISP_POS_ID,
  posAutCode: process.env.SISP_POS_AUT_CODE,
  appKey: process.env.SISP_APP_KEY,
  baseUrl: 'https://app.example.cv',
  sandbox: true,
});

const request = sisp.payment().amount(1500).build();
// render `request` into your own auto-submit form
```

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

**Nest is the exception.** Decorators cannot be applied conditionally, so `StatelessSispModule.forRoot({ sisp })` and its `StatelessSispController` declare every stateless route unconditionally. `POST /payment` raises `CorrelationRequiredError` (a 500) when no `correlation` store is configured, and `GET /callback` redirects to `redirectUrl` instead of returning a signed result when no `appKey` is configured. If you mount `StatelessSispModule` under Nest, configure both `correlation` and `appKey`, or do not mount the module at all.

The adapter names: `statelessSispRoutes` (Express), `statelessSispFastifyPlugin` (Fastify), `StatelessSispModule` / `StatelessSispController` / `STATELESS_SISP` (Nest), mirroring the stateful `sispRoutes`, `sispFastifyPlugin`, and `SispModule`.

`UserCancelled` is read from the request body or query before any fingerprint check, in both stateless and stateful mode. A client controlling its own callback submission can therefore mark its own transaction cancelled and skip verification entirely. In stateful mode the blast radius is limited: the cancel handler looks the transaction up by `merchantRef` and `merchantSession` before acting. The stateless `callback:rejected` event carries no such guarantee: `rejectCancelled` does no store lookup at all, and `merchantRef` in the event payload is whatever the caller submitted, unauthenticated. A consumer that cancels an order purely because it received this event is acting on caller-supplied input, not a verified fact. Guessing another customer's `merchantRef`/`merchantSession` pair is not practically feasible either way: `generateMerchantSession` produces `'S'` followed by the base36 millisecond timestamp and roughly five characters drawn from `crypto.randomInt` over a 36-symbol alphabet, but that is a property of the generator, not of the stateless cancel path, which does not check the pair against anything.

## Security posture

| Protection | Stateful | Stateless + `correlation` | Stateless without `correlation` |
|---|---|---|---|
| Gateway fingerprint | yes | yes | yes |
| Amount/currency/code vs original request | yes | yes | no |
| Replay of the same callback, sequential | yes | yes | no |
| Replay of the same callback, concurrent | yes | yes, if `claim` is atomic | no |
| Submission idempotency | yes | no, consumer middleware | no, consumer middleware |
| Rate limiting, blacklist | yes | no, consumer middleware | no, consumer middleware |

> Without a `correlation` store, verification is fingerprint-only. Cross-transaction amount tampering and callback replay are both your responsibility to guard against.

Rate limiting, blacklisting, and submission idempotency are absent from stateless mode on purpose: they are perimeter concerns that your framework's own middleware already solves (`express-rate-limit`, Fastify hooks, Nest guards), none of which need the package's tables. Submission idempotency specifically cannot work here even if the package tried: it needs the idempotency key from your request body, and `record()` writes a row keyed by a freshly generated `merchantRef`/`merchantSession` that is new on every submission, so there is nothing to deduplicate against.

The signed `GET /callback` result URL expires 5 minutes after it is issued. Every field in it is already inside the signature, so an expired URL is not a forgery risk, but without an expiry it would be a standing bearer assertion: once it sits in a customer's browser history or a `Referer` header, it would keep returning `{ verified: true }` indefinitely. A short TTL bounds that window to the immediate redirect the URL is built for.

`ScopedSisp` (multi-merchant, stateful-only) now emits `callback:*` through the shared verifier as well; previously it emitted no callback events at all.

## Growing into stateful

1. Swap `createStatelessSisp(cfg)` for `createSisp({ ...cfg, database: { client, connection } })`. `StatelessSispConfig` is a subset of `SispConfig` minus `correlation`.
2. Generate migrations: `autoMigrate: true` on knex, or `npx @akira-io/sisp prisma` plus `prisma migrate` on Prisma.
3. Nothing else. Types keep compiling because `Sisp extends StatelessSisp`; routes keep their paths and contracts; `callback:*` listeners keep firing.

Three caveats, all inherent and none of them scriptable:

- `correlation` goes dead. The package stops calling it. Your table now duplicates `sisp_transactions`; keeping or dropping it is your call, and the package never touches it either way.
- No backfill. Transactions written to your table before the switch are invisible to `sisp_transactions`, so `refund`, `cancel`, and `reconcilePending` will not work on them. The package cannot guess your column mapping.
- Submission idempotency, rate limiting, and blacklisting start working once you switch, which may duplicate middleware you already added for stateless mode.

**Previous:** [Storage Adapters](12-storage-adapters.md) | **Next:** [Index](00-index.md)
