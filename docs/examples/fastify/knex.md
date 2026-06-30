# Fastify with knex storage

The default setup: mount the gateway on Fastify and let the package build its knex storage from a `database` config. This is the flow validated against the real SISP/Vinti4 endpoint with 3D Secure enabled. For the same app on Prisma, see [Fastify with Prisma storage](prisma.md).

```ts
import { createSisp } from '@akira-io/sisp';
import { sispFastifyPlugin } from '@akira-io/sisp/fastify';
import Fastify from 'fastify';

const sisp = await createSisp({
  posId: process.env.POS_ID,
  posAutCode: process.env.POS_AUT_CODE,
  url: process.env.SISP_URL, // https://mc.vinti4net.cv/BizMPIOnUsSisp/CardPayment
  sandbox: false,
  is3DSec: '1',
  currency: '132',
  appKey: process.env.APP_KEY,
  baseUrl: process.env.BASE_URL, // public origin the gateway returns the customer to
  database: {
    client: 'better-sqlite3',
    connection: { filename: './sisp.db' },
    autoMigrate: true,
  },
});

sisp.on('payment:completed', ({ transaction }) => {
  // fulfil the order
  console.log('paid', transaction.merchant_ref, transaction.amount);
});

const app = Fastify();
await app.register(sispFastifyPlugin, { sisp, prefix: '/sisp' });
await app.listen({ port: 3000 });
```

Submit a payment by posting a form to `/sisp/payment`. With `is3DSec: '1'` the request must carry the cardholder address fields, otherwise the package throws `MissingThreeDSecureDataError`:

```html
<form action="/sisp/payment" method="post">
  <input type="hidden" name="checkout_intent_id" value="checkout_123">
  <input type="hidden" name="amount" value="1500">
  <input type="hidden" name="customer_email" value="cliente@example.cv">
  <input type="hidden" name="customer_country" value="CV">
  <input type="hidden" name="customer_city" value="Praia">
  <input type="hidden" name="customer_address" value="Av. Cidade de Lisboa">
  <input type="hidden" name="customer_postal_code" value="7600">
  <input type="hidden" name="items[0][product_name]" value="Plano Pro">
  <input type="hidden" name="items[0][quantity]" value="1">
  <input type="hidden" name="items[0][unit_price]" value="1500">
  <input type="hidden" name="items[0][total_price]" value="1500">
  <button>Pay</button>
</form>
```

The response is an auto-submitting form that takes the browser to the gateway card page. After payment the gateway returns the customer to the callback route, which runs the callback pipeline and emits the result events.

## Gotchas confirmed against the live gateway

- The gateway caps `merchantRef` and `merchantSession` at 15 characters. The built-in generators stay within the limit; keep custom generators within it too.
- `BizMPIOnUsSisp` is a 3D Secure (MPI) endpoint. Sending `is3DSec: '0'` makes the gateway return a blank page, so keep it `'1'` and send the address fields.
- The customer's browser performs the callback redirect, so for single-machine manual testing `http://localhost` works without a tunnel. A public HTTPS `baseUrl` is needed only when paying from another device or when the terminal whitelists the response URL.

**Next:** [Fastify with Prisma storage](prisma.md)
