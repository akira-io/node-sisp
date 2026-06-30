# Fastify with Prisma storage

The same Fastify app as [knex storage](knex.md), but persistence runs on your own Prisma client. You inject the adapter through `storage`; the package core never imports Prisma. Behavior matches the knex adapter (the shared storage contract suite runs against both).

## Set up Prisma

Install the client and copy the reference schema into your project, then migrate:

```bash
npm install @prisma/client
npx @akira-io/sisp prisma            # copies the schema to ./prisma/sisp.prisma
# or, to append the models to an existing schema:
# npx @akira-io/sisp prisma --models-only --print >> prisma/schema.prisma
npx prisma migrate dev --name sisp
```

The shipped schema declares `postgresql`. Set `provider` and `DATABASE_URL` to your engine. Postgres and MySQL exercise real `SELECT ... FOR UPDATE` row locking; on SQLite the locks are a no-op (same as the knex adapter), and Prisma's SQLite `BigInt @id` lacks `AUTOINCREMENT`, so prefer Postgres or MySQL here.

## Mount the gateway

```ts
import { createSisp } from '@akira-io/sisp';
import { sispFastifyPlugin } from '@akira-io/sisp/fastify';
import { createPrismaStorage } from '@akira-io/sisp/prisma';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';

const prisma = new PrismaClient();

const sisp = await createSisp({
  posId: process.env.POS_ID,
  posAutCode: process.env.POS_AUT_CODE,
  url: process.env.SISP_URL, // https://mc.vinti4net.cv/BizMPIOnUsSisp/CardPayment
  sandbox: false,
  is3DSec: '1',
  currency: '132',
  appKey: process.env.APP_KEY,
  baseUrl: process.env.BASE_URL, // public origin the gateway returns the customer to
  storage: createPrismaStorage(prisma, undefined, process.env.APP_KEY, {
    provider: 'postgresql',
  }),
});

sisp.on('payment:completed', ({ transaction }) => {
  // fulfil the order
  console.log('paid', transaction.merchant_ref, transaction.amount);
});

const app = Fastify();
await app.register(sispFastifyPlugin, { sisp, prefix: '/sisp' });
await app.listen({ port: 3000 });
```

`createPrismaStorage(prisma, tables, appKey, { provider })`: pass `undefined` for `tables` to use the default `sisp_*` names, or a `SispTables` map to override them. `appKey` must match the one given to `createSisp` so encrypted payloads round-trip.

The payment form, the auto-submitting gateway hop, the callback flow, and the live-gateway gotchas are identical to the [knex example](knex.md) - only the `storage` wiring changes.

## Notes

- The package does not run Prisma migrations; you own the schema via `prisma migrate`.
- `sisp.db` (the raw knex instance) is unavailable when a non-knex storage is injected; use `sisp.models` / `sisp.storage` instead.
- Other ORMs (Drizzle, Sequelize, TypeORM) can implement the same `SispStorage` port. See [Storage adapters](../../12-storage-adapters.md).

**Next:** [Decoupled SPA (React)](../02-spa-react.md)
