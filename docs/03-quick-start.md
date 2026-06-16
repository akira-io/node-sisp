# Quick Start

A full payment round trip against the bundled sandbox, no SISP credentials needed.

## 1. Boot the client

```ts
import { createSisp } from '@akira-io/sisp';

const sisp = await createSisp({
  posId: '90051',
  posAutCode: 'any-code-works-in-sandbox',
  sandbox: true,
  appKey: 'a-long-random-secret',
  baseUrl: 'http://localhost:3000',
  database: {
    client: 'better-sqlite3',
    connection: { filename: './sisp.db' },
  },
});
```

## 2. Mount the routes

Fastify is the default adapter:

```ts
import Fastify from 'fastify';
import { sispFastifyPlugin } from '@akira-io/sisp/fastify';

const app = Fastify();
await app.register(sispFastifyPlugin, { sisp, prefix: '/sisp' });
await app.listen({ port: 3000 });
```

Express and NestJS work the same way through their own adapters, see [Adapters](06-adapters.md).

## 3. Listen for results

```ts
sisp.on('payment:completed', ({ transaction }) => {
  fulfillOrder(transaction.merchant_ref, transaction.amount_cents);
});

sisp.on('payment:failed', ({ transaction, payload }) => {
  notifySupport(transaction.merchant_ref, payload.messageType);
});
```

## 4. Submit a payment

POST a form to `/sisp/payment`:

```html
<form action="/sisp/payment" method="post">
  <input type="hidden" name="checkout_intent_id" value="checkout_123">
  <input type="hidden" name="amount" value="1500">
  <input type="hidden" name="customer_email" value="cliente@example.cv">
  <input type="hidden" name="items[0][product_name]" value="Plano Pro">
  <input type="hidden" name="items[0][quantity]" value="2">
  <input type="hidden" name="items[0][unit_price]" value="750">
  <input type="hidden" name="items[0][total_price]" value="1500">
  <button>Pagar</button>
</form>
```

Use one stable `checkout_intent_id` per checkout. If the customer posts the same checkout again, the package reuses the same local transaction instead of creating a duplicate.

The response is an auto-submitting form that redirects the browser to the gateway. In sandbox mode that is the local `/sisp/sandbox` route, which immediately posts a correctly signed callback back to `/sisp/callback`. The browser lands on `/sisp/callback?ref=R...`, which returns the payment result as JSON.

## 5. Or build requests in code

```ts
const request = sisp
  .payment()
  .amount(1500)
  .currency('132')
  .customerEmail('cliente@example.cv')
  .build();

// request.fingerprint, request.merchantRef, request.merchantSession, ...
```

**Next:** [Payment Flow](04-payment-flow.md)
