import { describe, expect, it, vi } from 'vitest';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import { build, recordPayment, request } from './handlers-harness';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

function errorCallbackBody(fields: Record<string, string>): Record<string, string> {
  const post: Record<string, string> = {
    messageType: '6',
    merchantRespMessageID: 'MSG-ABCDEFGH',
    merchantRespErrorCode: 'C',
    merchantRespErrorDetail: 'Insufficient funds',
    merchantRespErrorDescription: 'Transaction processed with error',
    merchantRespMerchantRef: fields.merchantRef ?? '',
    merchantRespMerchantSession: fields.merchantSession ?? '',
    merchantRespAdditionalErrorMessage: 'Saldo do cartão insuficiente',
    merchantRespTimeStamp: '2026-06-12 10:00:05',
  };

  return {
    ...post,
    resultFingerPrint: generateCallbackFingerprint(computeToken('code'), callbackPayloadFrom(post)),
  };
}

describe('stateless error callbacks', () => {
  it('verifies a decline for a recorded payment instead of calling it a mismatch', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const verified = vi.fn();

    events.on('callback:verified', verified);

    const fields = await recordPayment(handlers);

    await handlers.handleCallback(
      request({ method: 'POST', path: '/sisp/callback', body: errorCallbackBody(fields) }),
    );

    expect(verified).toHaveBeenCalledOnce();
    expect(verified.mock.calls[0]?.[0].status).toBe('failed');
    expect(verified.mock.calls[0]?.[0].reason).toBeNull();
    expect(verified.mock.calls[0]?.[0].payload.additionalErrorMessage).toBe(
      'Saldo do cartão insuficiente',
    );
  });

  it('still rejects a decline whose signed fields were tampered with', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const fields = await recordPayment(handlers);
    const body = errorCallbackBody(fields);

    await handlers.handleCallback(
      request({
        method: 'POST',
        path: '/sisp/callback',
        body: { ...body, merchantRespErrorCode: 'X' },
      }),
    );

    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0]?.[0].reason).toBe('invalid_callback_fingerprint');
  });

  it('rejects a decline for a payment it never recorded', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers, events } = build(correlation);
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    await handlers.handleCallback(
      request({
        method: 'POST',
        path: '/sisp/callback',
        body: errorCallbackBody({ merchantRef: 'R-unknown', merchantSession: 'S-unknown' }),
      }),
    );

    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0]?.[0].reason).not.toBeNull();
  });
});
