import { describe, expect, it, vi } from 'vitest';
import { MatchExpectedPayment } from '../../src/application/pipelines/callback/stateless/pipes/match-expected-payment';
import { VerifyFingerprint } from '../../src/application/pipelines/callback/stateless/pipes/verify-fingerprint';
import { StatelessCallbackContext } from '../../src/application/pipelines/callback/stateless/stateless-callback-context';
import { StatelessCallbackPipeline } from '../../src/application/pipelines/callback/stateless/stateless-callback-pipeline';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { CallbackRejectionReasons } from '../../src/domain/enums/callback-rejection-reason';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { sispCredentials } from '../../src/domain/value-objects/sisp-credentials';
import { generateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import { paymentRequestFixture } from './correlation-contract';
import { InMemoryPaymentCorrelationStore } from './in-memory-correlation-store';

const POS_AUT_CODE = 'secret-code';

const credentialsResolver = new StaticCredentialsResolver(
  sispCredentials({ posId: '90000045', posAutCode: POS_AUT_CODE, currency: '132' }),
);

function signedPayload(overrides: Record<string, unknown> = {}) {
  const post = {
    merchantRespMerchantRef: 'REF123',
    merchantRespMerchantSession: 'S20260730120000',
    merchantRespPurchaseAmount: 1500,
    currency: '132',
    transactionCode: '1',
    posID: '90000045',
    messageType: '8',
    merchantResp: '00',
    merchantRespCP: '01',
    ...overrides,
  };
  const payload = callbackPayloadFrom(post);
  const fingerprint = generateCallbackFingerprint(computeToken(POS_AUT_CODE), payload);

  return callbackPayloadFrom({ ...post, resultFingerPrint: fingerprint });
}

function pipeline(store: InMemoryPaymentCorrelationStore | null): StatelessCallbackPipeline {
  return new StatelessCallbackPipeline([
    new VerifyFingerprint(credentialsResolver),
    new MatchExpectedPayment(store, credentialsResolver),
  ]);
}

describe('StatelessCallbackPipeline', () => {
  it('verifies a correctly signed callback against the recorded payment', async () => {
    const store = new InMemoryPaymentCorrelationStore();
    await store.record(paymentRequestFixture());

    const context = await pipeline(store).run(new StatelessCallbackContext(signedPayload()));

    expect(context.toOutcome()).toEqual({
      verified: true,
      reason: null,
      payload: context.payload,
    });
  });

  it('rejects a tampered fingerprint without consulting the store', async () => {
    const store = new InMemoryPaymentCorrelationStore();
    await store.record(paymentRequestFixture());
    const claimSpy = vi.spyOn(store, 'claim');

    const payload = callbackPayloadFrom({
      merchantRespMerchantRef: 'REF123',
      merchantRespMerchantSession: 'S20260730120000',
      resultFingerPrint: 'forged',
    });
    const context = await pipeline(store).run(new StatelessCallbackContext(payload));

    expect(context.toOutcome().verified).toBe(false);
    expect(context.toOutcome().reason).toBe(CallbackRejectionReasons.InvalidFingerprint);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('rejects a callback whose amount does not match the recorded payment', async () => {
    const store = new InMemoryPaymentCorrelationStore();
    await store.record(paymentRequestFixture({ amount: 9999 }));

    const context = await pipeline(store).run(new StatelessCallbackContext(signedPayload()));

    expect(context.toOutcome().reason).toBe(CallbackRejectionReasons.DetailsMismatch);
  });

  it('rejects a callback for a pair the store never recorded', async () => {
    const context = await pipeline(new InMemoryPaymentCorrelationStore()).run(
      new StatelessCallbackContext(signedPayload()),
    );

    expect(context.toOutcome().reason).toBe(CallbackRejectionReasons.UnknownTransaction);
  });

  it('rejects a replay of an already processed callback', async () => {
    const store = new InMemoryPaymentCorrelationStore();
    await store.record(paymentRequestFixture());
    const first = pipeline(store);

    await first.run(new StatelessCallbackContext(signedPayload()));
    const replay = await pipeline(store).run(new StatelessCallbackContext(signedPayload()));

    expect(replay.toOutcome().reason).toBe(CallbackRejectionReasons.Replayed);
  });

  it('marks the record processed on rejection as well as success', async () => {
    const store = new InMemoryPaymentCorrelationStore();
    await store.record(paymentRequestFixture({ amount: 9999 }));

    await pipeline(store).run(new StatelessCallbackContext(signedPayload()));

    expect(store.processed).toHaveLength(1);
    expect(store.processed[0]?.outcome.verified).toBe(false);
  });

  it('verifies on fingerprint alone when no store is configured', async () => {
    const context = await pipeline(null).run(new StatelessCallbackContext(signedPayload()));

    expect(context.toOutcome().verified).toBe(true);
  });
});
