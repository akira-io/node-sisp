# Sandbox and Testing

## Sandbox mode

With `sandbox: true` (or `driver: 'sandbox'`) the payment form posts to the local `/sandbox` route instead of the real gateway. That route answers with an auto-submitting form carrying a correctly signed callback, so the whole flow (payment, gateway, callback, events, invoice) runs end to end with zero SISP credentials.

Force a specific outcome with the `status` field:

| Status | messageType | Result |
|--------|-------------|--------|
| `success` (default) | `8` | completed |
| `failed` | `6` | failed, with structured error data |
| anything else | `P` | completed (service payment) |

Generate payloads directly when testing your own callback handling:

```ts
const payload = sisp.generateSandboxPayload(
  { amount: 1500, merchantRef: 'R1', merchantSession: 'S1' },
  'failed',
);

await sisp.handlePaymentCallback(payload);
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

  const transaction = await sisp.handlePaymentCallback(payload);

  expect(transaction.status).toBe('completed');
});
```

## Golden vectors

Parity with the PHP implementation is enforced by `tests/fixtures/golden-vectors.json`, generated from the real `laravel-sisp` 2.x code by `scripts/generate-golden-vectors.php`. Regenerate after upstream fingerprint changes:

```bash
git clone --branch 2.x https://github.com/akira-io/laravel-sisp /tmp/laravel-sisp-2x
php scripts/generate-golden-vectors.php > tests/fixtures/golden-vectors.json
php scripts/generate-enums-data.php
php scripts/generate-countries.php
```

**Next:** [API Reference](09-api-reference.md)
