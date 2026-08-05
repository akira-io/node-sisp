import { BuildRequestPayloadAction } from '../../src/application/actions/build-request-payload';
import { credentialsFromConfig } from '../../src/application/config';
import { SispEventEmitter } from '../../src/application/events';
import { MatchExpectedPayment } from '../../src/application/pipelines/callback/stateless/pipes/match-expected-payment';
import { VerifyFingerprint } from '../../src/application/pipelines/callback/stateless/pipes/verify-fingerprint';
import { StatelessCallbackPipeline } from '../../src/application/pipelines/callback/stateless/stateless-callback-pipeline';
import { BuildSandboxPayloadAction } from '../../src/application/sandbox';
import {
  type ResolvedStatelessConfig,
  resolveStatelessConfig,
} from '../../src/application/stateless-config';
import { StatelessCallbackVerifier } from '../../src/application/verifiers/stateless-callback-verifier';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { createSispManager } from '../../src/infrastructure/drivers/sisp-manager';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import { StatelessSispHttpHandlers } from '../../src/infrastructure/http/stateless-handlers';
import { UrlSigner } from '../../src/support/signed-url';
import { extractForm } from '../helpers/auto-submit-form';
import type { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

export const items = [
  { product_name: 'Bilhete', quantity: 1, unit_price: 1500, total_price: 1500 },
];

export interface Harness {
  events: SispEventEmitter;
  resolved: ResolvedStatelessConfig;
  handlers: StatelessSispHttpHandlers;
}

export function request(overrides: Partial<HttpRequestInfo> = {}): HttpRequestInfo {
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

export function build(
  correlation: InMemoryPaymentCorrelationStore | null,
  appKey: string | null = 'app-key',
  sandbox = true,
): Harness {
  const resolved = resolveStatelessConfig({
    posId: '90000045',
    posAutCode: 'code',
    sandbox,
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

export async function recordPayment(
  handlers: StatelessSispHttpHandlers,
): Promise<Record<string, string>> {
  const payment = await handlers.handlePayment(request({ body: { amount: '1500', items } }));

  return extractForm(payment.type === 'html' ? payment.html : '').fields;
}
