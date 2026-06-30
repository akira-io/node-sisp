# Decoupled SPA (React)

Drive a payment from a separate React app with an API-only backend. Payment initiation still requires a full-page browser navigation to the gateway (3D Secure cannot run over XHR), so the pattern is: the SPA asks the API for a payment intent, submits it full-page, and the package hands the browser back to the SPA afterwards.

The package does the heavy lifting. `POST /sisp/payment/intent` runs the full payment pipeline (validation, idempotency, persist transaction and first attempt, sign the request) and returns the gateway target as JSON `{ action, fields, ref }`. The SPA only submits the form.

## Backend (Fastify, API + CORS)

```ts
import { createSisp, fromCents } from '@akira-io/sisp';
import { sispFastifyPlugin } from '@akira-io/sisp/fastify';
import cors from '@fastify/cors';
import Fastify from 'fastify';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const sisp = await createSisp({
  posId: process.env.POS_ID,
  posAutCode: process.env.POS_AUT_CODE,
  url: process.env.SISP_URL,
  sandbox: false,
  is3DSec: '1',
  appKey: process.env.APP_KEY,
  baseUrl: process.env.BASE_URL,
  frontendResultUrl: `${FRONTEND_URL}/result`,
  database: { client: 'better-sqlite3', connection: { filename: './sisp.db' }, autoMigrate: true },
});

const app = Fastify();
await app.register(cors, { origin: FRONTEND_URL });
await app.register(sispFastifyPlugin, { sisp, prefix: '/sisp' });

// Status endpoint the SPA polls after the gateway returns.
app.get('/api/transactions/:ref', async (request, reply) => {
  const { ref } = request.params as { ref: string };
  const transaction = await sisp.models.transactions.findByRef(ref);

  if (!transaction) {
    reply.status(404).send({ message: 'Transaction not found.' });
    return;
  }

  reply.send({
    ref: transaction.merchant_ref,
    status: transaction.status,
    amount: fromCents(transaction.amount_cents),
    detail: transaction.merchant_response,
  });
});

await app.listen({ port: 3000 });
```

The SPA posts straight to the adapter's `POST /sisp/payment/intent`; there is no custom payment code on the backend. `frontendResultUrl` makes a processed callback redirect the browser to `${frontendResultUrl}?ref=...` instead of the built-in JSON result page, so the SPA regains control.

## Frontend (React)

```tsx
const API = 'http://localhost:3000';

async function pay(form: HTMLFormElement) {
  const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
  const response = await fetch(`${API}/sisp/payment/intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: data.amount,
      customer_email: data.customer_email,
      customer_country: data.customer_country,
      customer_city: data.customer_city,
      customer_address: data.customer_address,
      customer_postal_code: data.customer_postal_code,
      items: [
        {
          product_name: 'Plano Pro',
          quantity: '1',
          unit_price: data.amount,
          total_price: data.amount,
        },
      ],
    }),
  });

  const { action, fields } = await response.json();
  const gateway = document.createElement('form');
  gateway.method = 'POST';
  gateway.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    gateway.appendChild(input);
  }
  document.body.appendChild(gateway);
  gateway.submit();
}
```

The result route reads `ref` from the query string and polls the status endpoint until it leaves `pending`:

```tsx
const ref = new URLSearchParams(location.search).get('ref');
const response = await fetch(`${API}/api/transactions/${ref}`);
const transaction = await response.json(); // { status, amount, detail }
```

## Flow summary

```
SPA --POST /sisp/payment/intent--> backend: { action, fields, ref }
SPA --full-page POST--> gateway (3D Secure card page)
gateway --> backend /sisp/callback (processed, events emitted)
backend --redirect--> SPA /result?ref=...
SPA --GET /api/transactions/:ref--> backend: authoritative status
```

`/sisp/payment` (HTML) and `/sisp/payment/intent` (JSON) run the same pipeline; a `fetch`-driven SPA must use the JSON one. See [Adapters](../06-adapters.md).

**Next:** [Handling cancellation](03-cancellation.md)
