# Adapters

The core exposes pure handlers (`sisp.handlers.*`) that take a normalized request and return `{ type: 'html' | 'json' | 'redirect', ... }`. Adapters only translate framework requests and responses, so all three mount the same routes:

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/payment` | Validate, persist, and render the gateway form |
| GET, POST | `/callback` | Payment result page and gateway notification |
| GET, POST | `/retry-payment` | Signed retry flow |
| GET | `/cancel` | Signed cancel flow |
| GET, POST | `/sandbox` | Local fake gateway (sandbox mode only) |
| GET | `/countries` | ISO country catalog with numeric codes and flags |
| POST | `/refund/:transaction` | Refund, denied unless `authorizeRefund` allows it |

Mount the adapter at `basePath` (default `/sisp`) so the signed URLs and the sandbox endpoint resolve correctly.

## Express

```ts
import express from 'express';
import { sispRoutes } from '@akira-io/sisp/express';

const app = express();
app.use('/sisp', sispRoutes(sisp, {
  authorizeRefund: (req) => req.user?.can('refund') ?? false,
}));
```

## Fastify

Requires `fastify` and `@fastify/formbody` as peers. The plugin registers formbody with a `qs` parser so nested item fields parse like Express:

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
