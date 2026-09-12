# Sandbox and Testing

## Sandbox mode

With `sandbox: true` (or `driver: 'sandbox'`) the payment form posts to the local `/sandbox` route instead of the real gateway. Because that route completes any pending transaction with a correctly signed callback, `createSisp` and `createStatelessSisp` refuse `sandbox: true` when `NODE_ENV` is `production` unless `allowSandboxInProduction: true` is set. Given a `status`, that route answers with an auto-submitting form carrying the callback for that outcome, so the whole flow (payment, gateway, callback, events, invoice) runs end to end with zero SISP credentials. Without one it asks which outcome to produce.

## Choosing an outcome

Posting to `/sandbox` without a `status` renders an outcome chooser: the request identifiers
(`merchantRef`, `merchantSession`, `amount`) and one button per outcome. Each button re-posts to
`/sandbox` with `status` filled in, and from there the route behaves as it always has, auto-submitting
the callback. Pass `status` explicitly to skip the screen, which is what automated suites should do.

| Status | messageType | Result |
|--------|-------------|--------|
| `success` | `8` | completed |
| `failed` | `6` | failed, posted as a real error callback (`merchantRespErrorCode`, `merchantRespErrorDescription`, `merchantRespErrorDetail`, `merchantRespAdditionalErrorMessage`, `languageMessages`, no amount) |
| `cancelled` | none | the gateway's cancellation post: `merchantRef`, `merchantSession`, `UserCancelled=true`, no message type and no fingerprint |
| `tampered` | `8` | a purchase callback whose `resultFingerPrint` is invalid, so the verifier rejects it |
| anything else | `P` | completed (service payment) |

The decline defaults to the only pair observed from the production gateway
(`F` / `FALHA NA AUTENTICACAO CLIENTE`). Override any of `errorCode`, `errorDescription`,
`errorDetail` and `additionalErrorMessage` from the chooser's text fields, from the request body, or
from the third argument of `generateSandboxPayload`. There is no documented catalogue of SISP error
codes, so nothing else is invented here.

`cancelled` and `tampered` are outcomes of the route, not callback payloads: a cancellation has
nothing to sign and a tampered callback is a broken signature over a normal one. Asking
`generateSandboxPayload` for either throws rather than returning a successful payment.

Suites written against an earlier version post to `/sandbox` without a status and expect the callback
to be submitted for them. Add `status: 'success'` to keep that behaviour.

### What the sandbox cannot prove

The sandbox signs callbacks with `generateCallbackFingerprint`, the same function the verifier
validates them with. It is consistent with itself by construction, so a green suite says your
integration handles the callbacks this package produces, not that the package matches the gateway.
Protocol conformance is only established against the real gateway.

Generate payloads directly when testing your own callback handling:

```ts
const payload = sisp.generateSandboxPayload(
  { amount: 1500, merchantRef: 'R1', merchantSession: 'S1' },
  'failed',
  { errorCode: 'F', errorDescription: 'FALHA NA AUTENTICACAO CLIENTE' },
);

await sisp.handleCallback(payload);
```

## Testing your integration

Use an in-memory SQLite database per test, real pipelines, no mocks:

```ts
import { beforeEach, afterEach, expect, it } from 'vitest';
import { createSisp, type Sisp } from '@akira-io/sisp';

let sisp: Sisp;

beforeEach(async () => {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'test-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
});

afterEach(() => sisp.destroy());

it('completes sandbox payments', async () => {
  await sisp.models.transactions.create({
    merchantRef: 'R1',
    merchantSession: 'S1',
    amount: 1500,
  });

  const payload = sisp.generateSandboxPayload({
    amount: 1500,
    merchantRef: 'R1',
    merchantSession: 'S1',
  });

  const { transaction } = await sisp.handleCallback(payload);

  expect(transaction.status).toBe('completed');
});
```

**Next:** [API Reference](09-api-reference.md)
