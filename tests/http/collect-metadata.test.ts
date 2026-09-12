import { afterEach, describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { callbackPayloadToFormFields } from '../../src/domain/value-objects/callback-payload';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import type { TransactionRecord } from '../../src/infrastructure/storage/knex/records';

let sisp: Sisp;

afterEach(() => sisp.destroy());

async function createGateway(collectMetadata: boolean): Promise<Sisp> {
  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    baseUrl: 'https://app.example.cv',
    security: { collectMetadata },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });

  return sisp;
}

function paymentRequest(): HttpRequestInfo {
  return {
    ip: '10.0.0.1',
    method: 'POST',
    path: '/sisp/payment',
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari' },
    query: {},
    body: {
      amount: '1500',
      customer_email: 'cliente@example.cv',
      items: [{ product_name: 'Pro', quantity: '1', unit_price: '1500', total_price: '1500' }],
    },
  };
}

async function pay(gateway: Sisp): Promise<TransactionRecord> {
  const result = await gateway.handlers.handlePaymentIntent({
    ...paymentRequest(),
    path: '/sisp/payment/intent',
  });
  const ref = result.type === 'json' ? (result.data as { ref: string }).ref : '';
  const transaction = await gateway.models.transactions.findByRef(ref);

  if (!transaction) throw new Error('transaction was not persisted');

  return transaction;
}

async function notifyCallback(gateway: Sisp, transaction: TransactionRecord): Promise<void> {
  const payload = gateway.generateSandboxPayload({
    amount: 1500,
    merchantRef: transaction.merchant_ref,
    merchantSession: transaction.merchant_session,
  });

  await gateway.handlers.handleCallback({
    ip: '10.0.0.2',
    method: 'POST',
    path: '/sisp/callback',
    headers: { 'user-agent': 'curl/8' },
    query: {},
    body: callbackPayloadToFormFields(payload),
  });
}

describe('security.collectMetadata', () => {
  it('captures request metadata for the payment and the callback when enabled', async () => {
    const gateway = await createGateway(true);
    const transaction = await pay(gateway);

    expect(await gateway.storage.requestMetadata.listByTransaction(transaction.id)).toHaveLength(1);

    await notifyCallback(gateway, transaction);

    expect(await gateway.storage.requestMetadata.listByTransaction(transaction.id)).toHaveLength(2);
    expect((await gateway.models.transactions.findByRef(transaction.merchant_ref))?.status).toBe(
      'completed',
    );
  });

  it('captures nothing for the payment or the callback when disabled', async () => {
    const gateway = await createGateway(false);
    const transaction = await pay(gateway);

    await notifyCallback(gateway, transaction);

    expect(await gateway.storage.requestMetadata.listByTransaction(transaction.id)).toEqual([]);
    expect((await gateway.models.transactions.findByRef(transaction.merchant_ref))?.status).toBe(
      'completed',
    );
  });
});
