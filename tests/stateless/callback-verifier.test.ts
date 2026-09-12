import { describe, expect, it, vi } from 'vitest';
import { SispEventEmitter } from '../../src/application/events';
import { MatchExpectedPayment } from '../../src/application/pipelines/callback/stateless/pipes/match-expected-payment';
import { VerifyFingerprint } from '../../src/application/pipelines/callback/stateless/pipes/verify-fingerprint';
import { StatelessCallbackPipeline } from '../../src/application/pipelines/callback/stateless/stateless-callback-pipeline';
import { StatelessCallbackVerifier } from '../../src/application/verifiers/stateless-callback-verifier';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { CallbackRejectionReasons } from '../../src/domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../../src/domain/enums/transaction-status';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { sispCredentials } from '../../src/domain/value-objects/sisp-credentials';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';

const POS_AUT_CODE = 'secret-code';

const credentialsResolver = new StaticCredentialsResolver(
  sispCredentials({ posId: '90000045', posAutCode: POS_AUT_CODE, currency: '132' }),
);

function verifier(events: SispEventEmitter): StatelessCallbackVerifier {
  return new StatelessCallbackVerifier(
    new StatelessCallbackPipeline([
      new VerifyFingerprint(credentialsResolver),
      new MatchExpectedPayment(null, credentialsResolver),
    ]),
    events,
  );
}

function signedPayload(overrides: Record<string, unknown> = {}) {
  const post = {
    merchantRespMerchantRef: 'REF123',
    merchantRespMerchantSession: 'S1',
    merchantRespPurchaseAmount: 1500,
    messageType: '8',
    ...overrides,
  };
  const fingerprint = generateCallbackFingerprint(
    computeToken(POS_AUT_CODE),
    callbackPayloadFrom(post),
  );

  return callbackPayloadFrom({ ...post, resultFingerPrint: fingerprint });
}

describe('StatelessCallbackVerifier', () => {
  it('returns a verified outcome and emits callback:verified', async () => {
    const events = new SispEventEmitter();
    const verified = vi.fn();
    const rejected = vi.fn();

    events.on('callback:verified', verified);
    events.on('callback:rejected', rejected);

    const payload = signedPayload();
    const outcome = await verifier(events).verify(payload, { amount: 1500 });

    expect(outcome).toEqual({
      verified: true,
      status: TransactionStatus.Completed,
      reason: null,
      payload,
    });
    expect(verified).toHaveBeenCalledWith({
      payload,
      status: TransactionStatus.Completed,
      reason: null,
    });
    expect(rejected).not.toHaveBeenCalled();
  });

  it('returns a rejected outcome and emits callback:rejected with the reason', async () => {
    const events = new SispEventEmitter();
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const payload = callbackPayloadFrom({ resultFingerPrint: 'forged', messageType: '6' });
    const outcome = await verifier(events).verify(payload);

    expect(outcome.verified).toBe(false);
    expect(outcome.reason).toBe(CallbackRejectionReasons.InvalidFingerprint);
    expect(rejected).toHaveBeenCalledWith({
      payload,
      status: null,
      reason: CallbackRejectionReasons.InvalidFingerprint,
    });
  });

  it('carries no status on a forged purchase callback that asked to read as completed', async () => {
    const events = new SispEventEmitter();
    const rejected = vi.fn();

    events.on('callback:rejected', rejected);

    const payload = callbackPayloadFrom({
      merchantRespMerchantRef: 'REF123',
      merchantRespMerchantSession: 'S1',
      merchantRespPurchaseAmount: 1500,
      messageType: '8',
      resultFingerPrint: 'forged',
    });
    const outcome = await verifier(events).verify(payload, { amount: 1500 });

    expect(outcome.verified).toBe(false);
    expect(outcome.status).toBeNull();
    expect(outcome.reason).toBe(CallbackRejectionReasons.InvalidFingerprint);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ status: null }));
  });

  it('carries no status on a forged error callback either', async () => {
    const events = new SispEventEmitter();

    const payload = callbackPayloadFrom({
      merchantRespMerchantRef: 'REF123',
      merchantRespMerchantSession: 'S1',
      messageType: '6',
      resultFingerPrint: 'forged',
    });
    const outcome = await verifier(events).verify(payload);

    expect(outcome.verified).toBe(false);
    expect(outcome.status).toBeNull();
  });

  it('carries no status when an authentic callback does not match the expected payment', async () => {
    const events = new SispEventEmitter();

    const payload = signedPayload();
    const outcome = await verifier(events).verify(payload, { amount: 9999 });

    expect(outcome.verified).toBe(false);
    expect(outcome.status).toBeNull();
    expect(outcome.reason).toBe(CallbackRejectionReasons.DetailsMismatch);
  });

  it('reports a failed status for an authentic decline instead of reading as a success', async () => {
    const events = new SispEventEmitter();
    const verified = vi.fn();

    events.on('callback:verified', verified);

    const payload = signedPayload({ messageType: '6' });
    const outcome = await verifier(events).verify(payload);

    expect(outcome.verified).toBe(true);
    expect(outcome.reason).toBeNull();
    expect(outcome.status).toBe(TransactionStatus.Failed);
    expect(verified).toHaveBeenCalledWith(
      expect.objectContaining({ status: TransactionStatus.Failed }),
    );
  });
});
