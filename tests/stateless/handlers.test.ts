import { describe, expect, it } from 'vitest';
import { CorrelationRequiredError } from '../../src/domain/errors/exceptions';
import { extractForm } from '../helpers/auto-submit-form';
import { build, items, request } from './handlers-harness';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

describe('StatelessSispHttpHandlers', () => {
  it('rejects invalid payment input with 422', async () => {
    const { handlers } = build(new InMemoryPaymentCorrelationStore());

    const result = await handlers.handlePayment(request({ body: { amount: '0' } }));

    expect(result.type).toBe('json');

    if (result.type === 'json') {
      expect(result.status).toBe(422);
    }
  });

  it('records the payment and renders the auto-submit form', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers } = build(correlation);

    const result = await handlers.handlePayment(request({ body: { amount: '1500', items } }));

    expect(result.type).toBe('html');
    expect(correlation.recorded).toHaveLength(1);

    const form = extractForm(result.type === 'html' ? result.html : '');

    expect(form.fields.merchantRef).toBe(correlation.recorded[0]?.merchantRef);
  });

  it('throws CorrelationRequiredError when handlePayment runs without a store', async () => {
    const { handlers } = build(null);

    await expect(
      handlers.handlePayment(request({ body: { amount: '1500' } })),
    ).rejects.toBeInstanceOf(CorrelationRequiredError);
  });

  it('returns the gateway action and fields as JSON from the intent handler', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers } = build(correlation);

    const result = await handlers.handlePaymentIntent(request({ body: { amount: '1500', items } }));

    expect(result.type).toBe('json');
    expect(correlation.recorded).toHaveLength(1);

    const data = result.type === 'json' ? (result.data as Record<string, unknown>) : {};

    expect(typeof data.action).toBe('string');
    expect(data.ref).toBe(correlation.recorded[0]?.merchantRef);
  });

  it('redirects a POST callback to a signed result url', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers } = build(correlation);

    const payment = await handlers.handlePayment(request({ body: { amount: '1500', items } }));
    const form = extractForm(payment.type === 'html' ? payment.html : '');
    const sandbox = await handlers.handleSandbox(
      request({
        method: 'GET',
        query: {
          amount: '1500',
          merchantRef: form.fields.merchantRef,
          merchantSession: form.fields.merchantSession,
          status: 'success',
        },
      }),
    );
    const callbackForm = extractForm(sandbox.type === 'html' ? sandbox.html : '');

    const result = await handlers.handleCallback(
      request({ method: 'POST', path: '/sisp/callback', body: callbackForm.fields }),
    );

    expect(result.type).toBe('redirect');
    expect(result.type === 'redirect' ? result.location : '').toContain('signature=');
    expect(result.type === 'redirect' ? result.location : '').toContain('verified=1');
  });

  it('builds the POST callback payload from the body alone, ignoring the query string, matching the stateful handler', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const { handlers } = build(correlation);

    const payment = await handlers.handlePayment(request({ body: { amount: '1500', items } }));
    const form = extractForm(payment.type === 'html' ? payment.html : '');
    const sandbox = await handlers.handleSandbox(
      request({
        method: 'GET',
        query: {
          amount: '1500',
          merchantRef: form.fields.merchantRef,
          merchantSession: form.fields.merchantSession,
          status: 'success',
        },
      }),
    );
    const callbackForm = extractForm(sandbox.type === 'html' ? sandbox.html : '');
    const { posID: _posID, ...bodyWithoutPosID } = callbackForm.fields;

    const result = await handlers.handleCallback(
      request({
        method: 'POST',
        path: '/sisp/callback',
        query: { posID: 'attacker-supplied-posid' },
        body: bodyWithoutPosID,
      }),
    );

    expect(result.type).toBe('redirect');
    expect(result.type === 'redirect' ? result.location : '').toContain('verified=1');
  });

  it('returns JSON from a POST callback when no appKey is configured', async () => {
    const { handlers } = build(null, null);

    const result = await handlers.handleCallback(
      request({ method: 'POST', path: '/sisp/callback', body: { resultFingerPrint: 'forged' } }),
    );

    expect(result.type).toBe('json');
    expect(result.type === 'json' ? (result.data as { verified: boolean }).verified : true).toBe(
      false,
    );
  });

  it('serves the country list', () => {
    const { handlers } = build(null);

    const result = handlers.handleCountries();

    expect(result.type).toBe('json');

    const data = result.type === 'json' ? (result.data as Record<string, unknown>) : {};

    expect(Object.keys(data).length).toBeGreaterThan(0);
  });

  it('404s the sandbox handler outside sandbox mode', async () => {
    const { handlers } = build(null, null, false);

    const result = await handlers.handleSandbox(request({ method: 'GET' }));

    expect(result.type).toBe('json');

    if (result.type === 'json') {
      expect(result.status).toBe(404);
    }
  });
});
