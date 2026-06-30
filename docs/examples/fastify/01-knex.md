# Fastify with knex storage

The default setup: mount the gateway on Fastify and let the package build its knex storage from a `database` config. This is the flow validated against the real SISP/Vinti4 endpoint with 3D Secure enabled. For the same app on Prisma, see [Fastify with Prisma storage](02-prisma.md).

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

This file covers only the storage wiring. To submit a payment, render a checkout that posts to `/sisp/payment` ([server-side rendering](03-ssr.md)) or drive it from a decoupled SPA ([React](04-react.md)); both flows persist through the knex storage configured above.

**Next:** [Fastify with Prisma storage](02-prisma.md)
