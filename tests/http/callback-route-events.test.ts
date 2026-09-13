import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import { createStatelessSisp } from '../../src/application/create-stateless-sisp';
import type { Sisp } from '../../src/application/sisp';
import { CallbackRejectionReasons } from '../../src/domain/enums/callback-rejection-reason';
import { callbackPayloadToFormFields } from '../../src/domain/value-objects/callback-payload';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import { InMemoryPaymentCorrelationStore } from '../stateless/in-memory-correlation-store';

const CONFIG = { posId: '90000045', posAutCode: 'code', sandbox: true, appKey: 'app-key' } as const;

let sisp: Sisp | null = null;

afterEach(async () => {
  await sisp?.destroy();
  sisp = null;
});

async function statefulSisp(): Promise<Sisp> {
  sisp = await createSisp({
    ...CONFIG,
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' }, autoMigrate: true },
  });

  return sisp;
}

function callbackRequest(body: Record<string, unknown>): HttpRequestInfo {
  return {
    ip: '127.0.0.1',
    method: 'POST',
    path: '/sisp/callback',
    headers: {},
    query: {},
    body,
  };
}

describe('callback route events', () => {
  it('emits callback:rejected with callback_replayed on a duplicate delivery to the stateful route', async () => {
    const stateful = await statefulSisp();
    const rejected = vi.fn();

    stateful.on('callback:rejected', rejected);

    const transaction = await stateful.models.transactions.create({
      merchantRef: 'R20260913100000',
      merchantSession: 'S20260913100000',
      amount: 1500,
    });

    await stateful.models.transactionAttempts.createFromTransaction(transaction);

    const body = callbackPayloadToFormFields(
      stateful.generateSandboxPayload({
        amount: 1500,
        merchantRef: transaction.merchant_ref,
        merchantSession: transaction.merchant_session,
      }),
    );

    await stateful.handlers.handleCallback(callbackRequest(body));

    rejected.mockClear();

    const replay = await stateful.handlers.handleCallback(callbackRequest(body));

    expect(replay.type).toBe('redirect');
    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0]?.[0].reason).toBe(CallbackRejectionReasons.Replayed);
    expect(rejected.mock.calls[0]?.[0].status).toBeNull();
    expect(rejected.mock.calls[0]?.[0].payload.merchantRef).toBe(transaction.merchant_ref);
  });

  it('emits callback:rejected with unknown_transaction on the stateful route', async () => {
    const stateful = await statefulSisp();
    const rejected = vi.fn();

    stateful.on('callback:rejected', rejected);

    const body = callbackPayloadToFormFields(
      stateful.generateSandboxPayload({
        amount: 1500,
        merchantRef: 'R20260913110000',
        merchantSession: 'S20260913110000',
      }),
    );

    const result = await stateful.handlers.handleCallback(callbackRequest(body));

    expect(result.type).toBe('redirect');
    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0]?.[0].reason).toBe(CallbackRejectionReasons.UnknownTransaction);
    expect(rejected.mock.calls[0]?.[0].status).toBeNull();
    expect(rejected.mock.calls[0]?.[0].payload.merchantRef).toBe('R20260913110000');
  });

  it('reports the same rejection reasons as the stateless route for the same deliveries', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const stateless = createStatelessSisp({ ...CONFIG, correlation });
    const statelessRejected = vi.fn();

    stateless.on('callback:rejected', statelessRejected);

    const request = stateless.payment().amount(1500).build();

    await correlation.record(request);

    const body = callbackPayloadToFormFields(
      stateless.generateSandboxPayload({
        amount: 1500,
        merchantRef: request.merchantRef,
        merchantSession: request.merchantSession,
      }),
    );

    await stateless.handlers.handleCallback(callbackRequest(body));
    await stateless.handlers.handleCallback(callbackRequest(body));
    await stateless.handlers.handleCallback(
      callbackRequest(
        callbackPayloadToFormFields(
          stateless.generateSandboxPayload({
            amount: 1500,
            merchantRef: 'R20260913120000',
            merchantSession: 'S20260913120000',
          }),
        ),
      ),
    );

    const statelessReasons = statelessRejected.mock.calls.map((call) => call[0].reason);

    expect(statelessReasons).toEqual([
      CallbackRejectionReasons.Replayed,
      CallbackRejectionReasons.UnknownTransaction,
    ]);

    const stateful = await statefulSisp();
    const statefulRejected = vi.fn();

    stateful.on('callback:rejected', statefulRejected);

    const transaction = await stateful.models.transactions.create({
      merchantRef: 'R20260913130000',
      merchantSession: 'S20260913130000',
      amount: 1500,
    });

    await stateful.models.transactionAttempts.createFromTransaction(transaction);

    const statefulBody = callbackPayloadToFormFields(
      stateful.generateSandboxPayload({
        amount: 1500,
        merchantRef: transaction.merchant_ref,
        merchantSession: transaction.merchant_session,
      }),
    );

    await stateful.handlers.handleCallback(callbackRequest(statefulBody));
    await stateful.handlers.handleCallback(callbackRequest(statefulBody));
    await stateful.handlers.handleCallback(
      callbackRequest(
        callbackPayloadToFormFields(
          stateful.generateSandboxPayload({
            amount: 1500,
            merchantRef: 'R20260913140000',
            merchantSession: 'S20260913140000',
          }),
        ),
      ),
    );

    expect(statefulRejected.mock.calls.map((call) => call[0].reason)).toEqual(statelessReasons);
  });

  it('cancels on the stateful route when the flag arrives with the merchantResp field names', async () => {
    const stateful = await statefulSisp();
    const rejected = vi.fn();
    const cancelled = vi.fn();

    stateful.on('callback:rejected', rejected);
    stateful.on('transaction:cancelled', cancelled);

    const transaction = await stateful.models.transactions.create({
      merchantRef: 'R20260913150000',
      merchantSession: 'S20260913150000',
      amount: 1500,
    });

    const result = await stateful.handlers.handleCallback(
      callbackRequest({
        UserCancelled: 'true',
        merchantRespMerchantRef: transaction.merchant_ref,
        merchantRespMerchantSession: transaction.merchant_session,
      }),
    );
    const stored = await stateful.models.transactions.findById(transaction.id);

    expect(result.type).toBe('redirect');
    expect(stored?.status).toBe('cancelled');
    expect(cancelled).toHaveBeenCalledOnce();
    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0]?.[0].reason).toBe(CallbackRejectionReasons.UserCancelled);
  });
});
