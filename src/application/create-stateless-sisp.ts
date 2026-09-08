import {
  type CredentialsResolver,
  StaticCredentialsResolver,
} from '../core/contracts/credentials-resolver';
import { createSispManager } from '../infrastructure/drivers/sisp-manager';
import { StatelessSispHttpHandlers } from '../infrastructure/http/stateless-handlers';
import { UrlSigner } from '../support/signed-url';
import { BuildRequestPayloadAction } from './actions/build-request-payload';
import { credentialsFromConfig } from './config';
import { SispEventEmitter } from './events';
import { MatchExpectedPayment } from './pipelines/callback/stateless/pipes/match-expected-payment';
import { VerifyFingerprint } from './pipelines/callback/stateless/pipes/verify-fingerprint';
import type { StatelessCallbackPipe } from './pipelines/callback/stateless/stateless-callback-pipeline';
import { StatelessCallbackPipeline } from './pipelines/callback/stateless/stateless-callback-pipeline';
import { BuildSandboxPayloadAction } from './sandbox';
import { resolveStatelessConfig, type StatelessSispConfig } from './stateless-config';
import { StatelessSisp } from './stateless-sisp';
import { StatelessCallbackVerifier } from './verifiers/stateless-callback-verifier';

export function createStatelessSisp(config: StatelessSispConfig): StatelessSisp {
  const resolved = resolveStatelessConfig(config);
  const credentialsResolver: CredentialsResolver = new StaticCredentialsResolver(
    credentialsFromConfig(resolved),
  );
  const events = new SispEventEmitter(resolved.onEventListenerError ?? undefined);
  const manager = createSispManager(resolved, credentialsResolver);
  const buildRequestPayload = new BuildRequestPayloadAction(resolved, credentialsResolver);
  const buildSandboxPayload = new BuildSandboxPayloadAction(resolved, credentialsResolver);

  const defaultPipes: StatelessCallbackPipe[] = [
    new VerifyFingerprint(credentialsResolver),
    new MatchExpectedPayment(resolved.correlation, credentialsResolver, resolved.expectedPayment),
  ];
  const pipes = resolved.pipelines.callback
    ? resolved.pipelines.callback(defaultPipes)
    : defaultPipes;

  const callbackVerifier = new StatelessCallbackVerifier(
    new StatelessCallbackPipeline(pipes),
    events,
  );
  const urlSigner = new UrlSigner(resolved.appKey);

  const handlers = new StatelessSispHttpHandlers({
    config: resolved,
    events,
    manager,
    buildRequestPayload,
    buildSandboxPayload,
    callbackVerifier,
    urlSigner,
  });

  return new StatelessSisp(
    resolved,
    events,
    manager,
    handlers,
    credentialsResolver,
    buildRequestPayload,
    buildSandboxPayload,
    callbackVerifier,
    resolved.correlation !== null,
  );
}
