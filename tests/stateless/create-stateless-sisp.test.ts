import { describe, expect, it, vi } from 'vitest';
import { createStatelessSisp } from '../../src/application/create-stateless-sisp';
import { StatelessSisp } from '../../src/application/stateless-sisp';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

function makeSisp(correlation?: InMemoryPaymentCorrelationStore): StatelessSisp {
  return createStatelessSisp({
    posId: '90000045',
    posAutCode: 'code',
    sandbox: true,
    baseUrl: 'https://shop.test',
    appKey: 'app-key',
    ...(correlation ? { correlation } : {}),
  });
}

describe('createStatelessSisp', () => {
  it('builds without a storage or a database', () => {
    expect(makeSisp()).toBeInstanceOf(StatelessSisp);
  });

  it('builds a signed payment request through the builder', () => {
    const request = makeSisp().payment().amount(1500).build();

    expect(request.merchantRef).toMatch(/.+/);
    expect(request.merchantSession).toMatch(/.+/);
    expect(request.fingerprint).toMatch(/.+/);
  });

  it('validates a sandbox callback end to end', async () => {
    const sisp = makeSisp();
    const request = sisp.payment().amount(1500).build();
    const payload = sisp.generateSandboxPayload({
      amount: 1500,
      merchantRef: request.merchantRef,
      merchantSession: request.merchantSession,
      timeStamp: request.timeStamp,
    });

    expect(sisp.validateCallback(payload)).toBe(true);
    expect((await sisp.handleCallback(payload)).reason).toBe('expected_payment_missing');
    expect((await sisp.handleCallback(payload, { amount: 1500 })).verified).toBe(true);
    expect((await sisp.handleCallback(payload, { amount: 1400 })).reason).toBe(
      'callback_details_mismatch',
    );
  });

  it('resolves the expected payment from configuration when no store is set', async () => {
    const expectedPayment = vi.fn(async () => ({ amount: 1500 }));
    const sisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      sandbox: true,
      baseUrl: 'https://shop.test',
      appKey: 'app-key',
      expectedPayment,
    });
    const request = sisp.payment().amount(1500).build();
    const payload = sisp.generateSandboxPayload({
      amount: 1500,
      merchantRef: request.merchantRef,
      merchantSession: request.merchantSession,
      timeStamp: request.timeStamp,
    });

    expect((await sisp.handleCallback(payload)).verified).toBe(true);
    expect(expectedPayment).toHaveBeenCalledWith(payload);
  });

  it('matches the callback against the correlation store', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const sisp = makeSisp(correlation);
    const request = sisp.payment().amount(1500).build();

    await correlation.record(request);

    const payload = sisp.generateSandboxPayload({
      amount: 1500,
      merchantRef: request.merchantRef,
      merchantSession: request.merchantSession,
      timeStamp: request.timeStamp,
    });

    expect((await sisp.handleCallback(payload)).verified).toBe(true);
    expect((await sisp.handleCallback(payload)).reason).toBe('callback_replayed');
  });

  it('registers and removes event listeners', async () => {
    const sisp = makeSisp();
    const listener = vi.fn();

    sisp.on('callback:verified', listener);
    const request = sisp.payment().amount(1500).build();

    await sisp.handleCallback(
      sisp.generateSandboxPayload({
        amount: 1500,
        merchantRef: request.merchantRef,
        merchantSession: request.merchantSession,
        timeStamp: request.timeStamp,
      }),
      { amount: 1500 },
    );

    expect(listener).toHaveBeenCalledTimes(1);

    sisp.off('callback:verified', listener);
    await sisp.handleCallback(
      sisp.generateSandboxPayload({ amount: 1500, merchantRef: 'X', merchantSession: 'Y' }),
      { amount: 1500 },
    );

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('resolves the sandbox driver and destroys cleanly', async () => {
    const sisp = makeSisp();

    expect(sisp.driver().paymentEndpoint()).toMatch(/^https?:\/\//);
    await expect(sisp.destroy()).resolves.toBeUndefined();
  });

  it('applies a callback pipeline customizer', async () => {
    const seen: string[] = [];
    const sisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      sandbox: true,
      pipelines: {
        callback: (defaults) => [
          {
            handle: async (context, next) => {
              seen.push(context.payload.merchantRef);

              await next();
            },
          },
          ...defaults,
        ],
      },
    });
    const request = sisp.payment().amount(1500).build();

    await sisp.handleCallback(
      sisp.generateSandboxPayload({
        amount: 1500,
        merchantRef: request.merchantRef,
        merchantSession: request.merchantSession,
        timeStamp: request.timeStamp,
      }),
    );

    expect(seen).toEqual([request.merchantRef]);
  });
});
