import { describe, expect, it, vi } from 'vitest';
import { createSisp } from '../src/application/create-sisp';
import { createStatelessSisp } from '../src/application/create-stateless-sisp';
import type { CallbackEvent } from '../src/application/events';
import { CallbackRejectionReasons } from '../src/domain/enums/callback-rejection-reason';
import { extractForm } from './helpers/auto-submit-form';
import { InMemoryPaymentCorrelationStore } from './stateless/in-memory-correlation-store';

const CONFIG = { posId: '90000045', posAutCode: 'code', sandbox: true, appKey: 'app-key' } as const;

const items = [{ product_name: 'Bilhete', quantity: 1, unit_price: 1500, total_price: 1500 }];

describe('callback event parity across modes', () => {
  it('fires callback:verified with the same shape in both modes', async () => {
    const seen: CallbackEvent[] = [];
    const listener = (event: CallbackEvent): void => {
      seen.push(event);
    };

    const correlation = new InMemoryPaymentCorrelationStore();
    const stateless = createStatelessSisp({ ...CONFIG, correlation });

    stateless.on('callback:verified', listener);

    const statelessRequest = stateless.payment().amount(1500).build();

    await correlation.record(statelessRequest);
    await stateless.handleCallback(
      stateless.generateSandboxPayload({
        amount: 1500,
        merchantRef: statelessRequest.merchantRef,
        merchantSession: statelessRequest.merchantSession,
      }),
    );

    const stateful = await createSisp({
      ...CONFIG,
      database: {
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        autoMigrate: true,
      },
    });

    try {
      stateful.on('callback:verified', listener);

      const paymentResult = await stateful.handlers.handlePayment({
        ip: '127.0.0.1',
        method: 'POST',
        path: '/sisp/payment',
        headers: {},
        query: {},
        body: { amount: '1500', items },
      });

      if (paymentResult.type !== 'html') {
        throw new Error(`Expected an auto-submit form, got ${paymentResult.type}.`);
      }

      const { fields } = extractForm(paymentResult.html);
      const merchantRef = fields.merchantRef;
      const merchantSession = fields.merchantSession;

      if (merchantRef === undefined || merchantSession === undefined) {
        throw new Error('Payment form did not include merchantRef/merchantSession.');
      }

      await stateful.handleCallback(
        stateful.generateSandboxPayload({ amount: 1500, merchantRef, merchantSession }),
      );

      expect(seen).toHaveLength(2);
      expect(Object.keys(seen[0] ?? {}).sort()).toEqual(Object.keys(seen[1] ?? {}).sort());
      expect(seen[0]?.reason).toBeNull();
      expect(seen[1]?.reason).toBeNull();
    } finally {
      await stateful.destroy();
    }
  });

  it('fires callback:verified exactly once and callback:rejected once on a duplicate delivery, in both modes', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const stateless = createStatelessSisp({ ...CONFIG, correlation });
    const statelessVerified = vi.fn();
    const statelessRejected = vi.fn();

    stateless.on('callback:verified', statelessVerified);
    stateless.on('callback:rejected', statelessRejected);

    const statelessRequest = stateless.payment().amount(1500).build();

    await correlation.record(statelessRequest);

    const statelessPayload = stateless.generateSandboxPayload({
      amount: 1500,
      merchantRef: statelessRequest.merchantRef,
      merchantSession: statelessRequest.merchantSession,
    });

    await stateless.handleCallback(statelessPayload);
    await stateless.handleCallback(statelessPayload);

    expect(statelessVerified).toHaveBeenCalledTimes(1);
    expect(statelessRejected).toHaveBeenCalledTimes(1);
    expect(statelessRejected.mock.calls[0]?.[0].reason).toBe(CallbackRejectionReasons.Replayed);

    const stateful = await createSisp({
      ...CONFIG,
      database: {
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        autoMigrate: true,
      },
    });

    try {
      const statefulVerified = vi.fn();
      const statefulRejected = vi.fn();

      stateful.on('callback:verified', statefulVerified);
      stateful.on('callback:rejected', statefulRejected);

      const paymentResult = await stateful.handlers.handlePayment({
        ip: '127.0.0.1',
        method: 'POST',
        path: '/sisp/payment',
        headers: {},
        query: {},
        body: { amount: '1500', items },
      });

      if (paymentResult.type !== 'html') {
        throw new Error(`Expected an auto-submit form, got ${paymentResult.type}.`);
      }

      const { fields } = extractForm(paymentResult.html);
      const merchantRef = fields.merchantRef;
      const merchantSession = fields.merchantSession;

      if (merchantRef === undefined || merchantSession === undefined) {
        throw new Error('Payment form did not include merchantRef/merchantSession.');
      }

      const statefulPayload = stateful.generateSandboxPayload({
        amount: 1500,
        merchantRef,
        merchantSession,
      });

      await stateful.handleCallback(statefulPayload);
      await stateful.handleCallback(statefulPayload);

      expect(statefulVerified).toHaveBeenCalledTimes(1);
      expect(statefulRejected).toHaveBeenCalledTimes(1);
      expect(statefulRejected.mock.calls[0]?.[0].reason).toBe(CallbackRejectionReasons.Replayed);
    } finally {
      await stateful.destroy();
    }
  });

  it('fires callback:rejected with user_cancelled in both modes', async () => {
    const statelessListener = vi.fn();
    const statefulListener = vi.fn();
    const cancelBody = {
      ip: '127.0.0.1',
      method: 'POST',
      path: '/sisp/callback',
      headers: {},
      query: {},
      body: { UserCancelled: 'true' },
    };

    const stateless = createStatelessSisp(CONFIG);

    stateless.on('callback:rejected', statelessListener);
    await stateless.handlers.handleCallback(cancelBody);

    const stateful = await createSisp({
      ...CONFIG,
      database: {
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        autoMigrate: true,
      },
    });

    try {
      stateful.on('callback:rejected', statefulListener);
      await stateful.handlers.handleCallback(cancelBody);

      expect(statelessListener.mock.calls[0]?.[0].reason).toBe(
        CallbackRejectionReasons.UserCancelled,
      );
      expect(statefulListener.mock.calls[0]?.[0].reason).toBe(
        CallbackRejectionReasons.UserCancelled,
      );
    } finally {
      await stateful.destroy();
    }
  });
});
