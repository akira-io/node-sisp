import { describe, expect, it, vi } from 'vitest';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import { build, recordPayment, request } from './handlers-harness';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

describe('StatelessSispHttpHandlers cancellations', () => {
  function cancelRequest(fields: Record<string, string>, userCancelled: string): HttpRequestInfo {
    return request({
      method: 'POST',
      path: '/sisp/callback',
      body: {
        UserCancelled: userCancelled,
        merchantRef: fields.merchantRef,
        merchantSession: fields.merchantSession,
      },
    });
  }

  function cancelRequestWithResponseNames(
    fields: Record<string, string>,
    userCancelled: string,
  ): HttpRequestInfo {
    return request({
      method: 'POST',
      path: '/sisp/callback',
      body: {
        UserCancelled: userCancelled,
        merchantRespMerchantRef: fields.merchantRef,
        merchantRespMerchantSession: fields.merchantSession,
      },
    });
  }

  it('emits callback:rejected only for a cancellation matching a payment it recorded, and redirects', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const fields = await recordPayment(handlers);
    const result = await handlers.handleCallback(cancelRequest(fields, 'true'));

    expect(result.type).toBe('redirect');
    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0]?.[0].reason).toBe('user_cancelled');
    expect(correlation.processed).toHaveLength(1);
    expect(correlation.processed[0]?.outcome.status).toBe('cancelled');
  });

  it('reads the flag spelled userCancelled, as the specification table writes it', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const fields = await recordPayment(handlers);
    const result = await handlers.handleCallback(
      request({
        method: 'POST',
        path: '/sisp/callback',
        body: {
          userCancelled: 'true',
          merchantRef: fields.merchantRef,
          merchantSession: fields.merchantSession,
        },
      }),
    );

    expect(result.type).toBe('redirect');
    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0]?.[0].reason).toBe('user_cancelled');
  });

  it('treats UserCancelled=on as cancelled, matching the stateful handler', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const fields = await recordPayment(handlers);
    const result = await handlers.handleCallback(cancelRequest(fields, 'on'));

    expect(result.type).toBe('redirect');
    expect(rejected.mock.calls[0]?.[0].reason).toBe('user_cancelled');
  });

  it('still accepts the identifiers under their callback response names', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const fields = await recordPayment(handlers);
    const result = await handlers.handleCallback(cancelRequestWithResponseNames(fields, 'true'));

    expect(result.type).toBe('redirect');
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(rejected.mock.calls[0]?.[0].payload.merchantRef).toBe(fields.merchantRef);
  });

  it('does not emit callback:rejected for a forged reference that was never recorded', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const result = await handlers.handleCallback(
      cancelRequest({ merchantRef: 'FORGED', merchantSession: 'FORGED-SESSION' }, 'true'),
    );

    expect(result.type).toBe('redirect');
    expect(rejected).not.toHaveBeenCalled();
  });

  it('does not emit callback:rejected for an already-processed payment and leaves the record untouched', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    const fields = await recordPayment(handlers);

    await handlers.handleCallback(cancelRequest(fields, 'true'));
    events.on('callback:rejected', rejected);

    const result = await handlers.handleCallback(cancelRequest(fields, 'true'));

    expect(result.type).toBe('redirect');
    expect(rejected).not.toHaveBeenCalled();
    expect(correlation.processed).toHaveLength(1);
  });

  it('does not emit callback:rejected when no correlation store is configured', async () => {
    const { handlers, events } = build(null);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const result = await handlers.handleCallback(
      request({ method: 'POST', path: '/sisp/callback', body: { UserCancelled: 'true' } }),
    );

    expect(result.type).toBe('redirect');
    expect(rejected).not.toHaveBeenCalled();
  });
});
