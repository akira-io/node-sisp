# Adapters

This page covers HTTP framework adapters (Express, Fastify, NestJS). For ORM-level adapters such as Prisma, see [Storage Adapters](12-storage-adapters.md).

The core exposes pure handlers (`sisp.handlers.*`) that take a normalized request and return `{ type: 'html' | 'json' | 'redirect', ... }`. HTTP adapters only translate framework requests and responses, so all three mount the same routes:

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/payment` | Validate, persist, and render the gateway form as **HTML** (auto-submitting) |
| POST | `/payment/intent` | Same validate + persist, but return the gateway target as **JSON** for a SPA |
| GET, POST | `/callback` | Payment result page and gateway notification |
| GET, POST | `/retry-payment` | Signed retry flow |
| GET | `/cancel` | Signed cancel flow |
| GET, POST | `/sandbox` | Local fake gateway (sandbox mode only) |
| GET | `/countries` | ISO country catalog with numeric codes and flags |
| POST | `/refund/:transaction` | Refund, denied unless `authorizeRefund` allows it |

Mount the adapter at `basePath` (default `/sisp`) so the signed URLs and the sandbox endpoint resolve correctly.

## `/payment` versus `/payment/intent`

Both run the exact same pipeline (validate, idempotency, persist the transaction and first attempt, sign the request). They differ only in the response and in who triggers the redirect to the gateway:

| | `POST /payment` | `POST /payment/intent` |
|---|---|---|
| Response | HTML auto-submitting form | JSON `{ action, fields, ref }` |
| Redirect to the gateway | Automatic, the browser submits the returned form | Your frontend builds the form and submits it |
| Use it from | A native full-page form post (server-rendered app, or a SPA that lets the browser navigate) | `fetch`/XHR in a SPA (React, Vue, Svelte) |
| Works with `fetch`? | No, a fetched HTML string will not navigate and its inline script will not run | Yes |

Rule of thumb: a SPA that calls the backend with `fetch` must use `/payment/intent`. `/payment` only works in a SPA if you let the browser do a native full-page form post to it. Either way the customer ends up on a full-page navigation to the gateway, which 3D Secure requires.

## Fastify (default)

The default adapter. Requires `fastify` and `@fastify/formbody` as peers. The plugin registers formbody with a `qs` parser so nested item fields parse correctly:

```ts
import Fastify from 'fastify';
import { sispFastifyPlugin } from '@akira-io/sisp/fastify';

const app = Fastify();
await app.register(sispFastifyPlugin, {
  sisp,
  prefix: '/sisp',
  authorizeRefund: (request) => Boolean(request.headers['x-admin']),
});
```

## Express

```ts
import express from 'express';
import { sispRoutes } from '@akira-io/sisp/express';

const app = express();
app.use('/sisp', sispRoutes(sisp, {
  authorizeRefund: (req) => req.user?.can('refund') ?? false,
}));
```

## NestJS

Requires `@nestjs/common` and runs on the default Express platform:

```ts
import { Module } from '@nestjs/common';
import { SispModule } from '@akira-io/sisp/nest';

@Module({
  imports: [
    SispModule.forRoot({
      sisp,
      authorizeRefund: (req) => Boolean(req.headers['x-admin']),
    }),
  ],
})
export class AppModule {}
```

The module registers a controller under the `sisp` path and exports the `SISP` token, so any provider can inject the instance:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { SISP } from '@akira-io/sisp/nest';
import type { Sisp } from '@akira-io/sisp';

@Injectable()
export class BillingService {
  constructor(@Inject(SISP) private readonly sisp: Sisp) {}
}
```

**Next:** [Security](07-security.md)
