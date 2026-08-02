import { describe, expect, it, vi } from 'vitest';
import { BuildRequestPayloadAction } from '../../src/application/actions/build-request-payload';
import { credentialsFromConfig } from '../../src/application/config';
import { SispEventEmitter } from '../../src/application/events';
import { MatchExpectedPayment } from '../../src/application/pipelines/callback/stateless/pipes/match-expected-payment';
import { VerifyFingerprint } from '../../src/application/pipelines/callback/stateless/pipes/verify-fingerprint';
import { StatelessCallbackPipeline } from '../../src/application/pipelines/callback/stateless/stateless-callback-pipeline';
import { BuildSandboxPayloadAction } from '../../src/application/sandbox';
import { resolveStatelessConfig } from '../../src/application/stateless-config';
import { StatelessCallbackVerifier } from '../../src/application/verifiers/stateless-callback-verifier';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { CorrelationRequiredError } from '../../src/domain/errors/exceptions';
import { createSispManager } from '../../src/infrastructure/drivers/sisp-manager';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import { StatelessSispHttpHandlers } from '../../src/infrastructure/http/stateless-handlers';
import { UrlSigner } from '../../src/support/signed-url';
import { extractForm } from '../helpers/auto-submit-form';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

const items = [{ product_name: 'Bilhete', quantity: 1, unit_price: 1500, total_price: 1500 }];

function request(overrides: Partial<HttpRequestInfo> = {}): HttpRequestInfo {
  return {
    ip: '127.0.0.1',
    method: 'POST',
    path: '/sisp/payment',
    headers: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function build(
  correlation: InMemoryPaymentCorrelationStore | null,
  appKey: string | null = 'app-key',
) {
  const resolved = resolveStatelessConfig({
    posId: '90000045',
    posAutCode: 'code',
    sandbox: true,
    baseUrl: 'https://shop.test',
    ...(appKey === null ? {} : { appKey }),
    ...(correlation === null ? {} : { correlation }),
  });
  const credentialsResolver = new StaticCredentialsResolver(credentialsFromConfig(resolved));
  const events = new SispEventEmitter();
  const verifier = new StatelessCallbackVerifier(
    new StatelessCallbackPipeline([
      new VerifyFingerprint(credentialsResolver),
      new MatchExpectedPayment(resolved.correlation, credentialsResolver),
    ]),
    events,
  );

  return {
    events,
    resolved,
    handlers: new StatelessSispHttpHandlers({
      config: resolved,
      manager: createSispManager(resolved, credentialsResolver),
      buildRequestPayload: new BuildRequestPayloadAction(resolved, credentialsResolver),
      buildSandboxPayload: new BuildSandboxPayloadAction(resolved, credentialsResolver),
      callbackVerifier: verifier,
      urlSigner: new UrlSigner(resolved.appKey),
      events,
    }),
  };
}

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

  async function recordPayment(
    handlers: StatelessSispHttpHandlers,
  ): Promise<Record<string, string>> {
    const payment = await handlers.handlePayment(request({ body: { amount: '1500', items } }));
    const { fields } = extractForm(payment.type === 'html' ? payment.html : '');

    return fields;
  }

  function cancelRequest(fields: Record<string, string>, userCancelled: string): HttpRequestInfo {
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

  it('serves the country list', () => {
    const { handlers } = build(null);

    const result = handlers.handleCountries();

    expect(result.type).toBe('json');

    const data = result.type === 'json' ? (result.data as Record<string, unknown>) : {};

    expect(Object.keys(data).length).toBeGreaterThan(0);
  });

  it('404s the sandbox handler outside sandbox mode', async () => {
    const resolved = resolveStatelessConfig({ posId: 'a', posAutCode: 'b', sandbox: false });
    const credentialsResolver = new StaticCredentialsResolver(credentialsFromConfig(resolved));
    const handlers = new StatelessSispHttpHandlers({
      config: resolved,
      manager: createSispManager(resolved, credentialsResolver),
      buildRequestPayload: new BuildRequestPayloadAction(resolved, credentialsResolver),
      buildSandboxPayload: new BuildSandboxPayloadAction(resolved, credentialsResolver),
      callbackVerifier: new StatelessCallbackVerifier(
        new StatelessCallbackPipeline([new VerifyFingerprint(credentialsResolver)]),
        new SispEventEmitter(),
      ),
      urlSigner: new UrlSigner(null),
      events: new SispEventEmitter(),
    });

    const result = await handlers.handleSandbox(request({ method: 'GET' }));

    expect(result.type).toBe('json');

    if (result.type === 'json') {
      expect(result.status).toBe(404);
    }
  });
});
