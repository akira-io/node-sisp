# Server-side rendering

The simplest integration: Fastify renders the pages on the server and the browser navigates full-page throughout. No client framework, no JSON intent, no CORS. The checkout page posts an HTML form straight to the adapter's `POST /sisp/payment`, which replies with an auto-submitting form to the gateway; after payment the gateway returns the customer to the callback route and you render the result from storage.

Storage is either [knex](01-knex.md) or [Prisma](02-prisma.md) - the routes below are identical for both; only the `createSisp` storage wiring changes.

```ts
import { createSisp, fromCents } from '@akira-io/sisp';
import { sispFastifyPlugin } from '@akira-io/sisp/fastify';
import formbody from '@fastify/formbody';
import Fastify from 'fastify';

const sisp = await createSisp({
  posId: process.env.POS_ID,
  posAutCode: process.env.POS_AUT_CODE,
  url: process.env.SISP_URL,
  sandbox: false,
  is3DSec: '1',
  appKey: process.env.APP_KEY,
  baseUrl: process.env.BASE_URL,
  database: { client: 'better-sqlite3', connection: { filename: './sisp.db' }, autoMigrate: true },
});

const app = Fastify();
await app.register(formbody);
await app.register(sispFastifyPlugin, { sisp, prefix: '/sisp' });

// Server-rendered checkout: a plain HTML form posting to the adapter.
app.get('/', async (_request, reply) => {
  reply.type('text/html').send(`
    <form action="/sisp/payment" method="post">
      <input type="hidden" name="checkout_intent_id" value="checkout_${Date.now()}">
      <input name="amount" type="number" value="1500" required>
      <input name="customer_email" type="email" value="cliente@example.cv" required>
      <input name="customer_country" value="CV" required>
      <input name="customer_city" value="Praia" required>
      <input name="customer_address" value="Av. Cidade de Lisboa" required>
      <input name="customer_postal_code" value="7600" required>
      <input type="hidden" name="items[0][product_name]" value="Plano Pro">
      <input type="hidden" name="items[0][quantity]" value="1">
      <input type="hidden" name="items[0][unit_price]" value="1500">
      <input type="hidden" name="items[0][total_price]" value="1500">
      <button>Pay</button>
    </form>
  `);
});

// Server-rendered result, read from storage after the callback runs.
app.get('/result/:ref', async (request, reply) => {
  const { ref } = request.params as { ref: string };
  const transaction = await sisp.models.transactions.findByRef(ref);

  if (!transaction) {
    reply.status(404).type('text/html').send('<p>Transaction not found.</p>');
    return;
  }

  reply.type('text/html').send(`
    <h1>Payment ${transaction.status}</h1>
    <p>Ref: ${transaction.merchant_ref}</p>
    <p>Amount: ${fromCents(transaction.amount_cents)}</p>
  `);
});

await app.listen({ port: 3000 });
```

Point the gateway back to the server-rendered result by setting `frontendResultUrl` to your `/result` route, or rely on the package's built-in JSON result page. Use `sisp.models.transactions.findByRef` (or `list`) to render any transaction state server-side; the same models back both storage engines.

With `is3DSec: '1'` the form must carry the cardholder address fields, otherwise the package throws `MissingThreeDSecureDataError`.

## Gotchas confirmed against the live gateway

- The gateway caps `merchantRef` and `merchantSession` at 15 characters. The built-in generators stay within the limit; keep custom generators within it too.
- `BizMPIOnUsSisp` is a 3D Secure (MPI) endpoint. Sending `is3DSec: '0'` makes the gateway return a blank page, so keep it `'1'` and send the address fields.
- The customer's browser performs the callback redirect, so for single-machine manual testing `http://localhost` works without a tunnel. A public HTTPS `baseUrl` is needed only when paying from another device or when the terminal whitelists the response URL.

**Next:** [Decoupled SPA (React)](04-react.md)
