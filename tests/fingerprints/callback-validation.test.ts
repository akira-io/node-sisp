import { describe, expect, it } from 'vitest';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import {
  generateCallbackFingerprint,
  validateCallbackFingerprint,
} from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';

const token = computeToken('TEST_POS_AUT_CODE');

function signedPayload(overrides: Record<string, unknown> = {}) {
  const post: Record<string, unknown> = {
    messageType: '8',
    merchantRespCP: '01',
    merchantRespTid: 'TID-1',
    merchantRespMerchantRef: 'R1',
    merchantRespMerchantSession: 'S1',
    merchantRespPurchaseAmount: '1500',
    merchantRespTimeStamp: '2026-06-12 10:00:05',
    merchantResp: '00',
    ...overrides,
  };

  const fingerprint = generateCallbackFingerprint(token, callbackPayloadFrom(post));

  return callbackPayloadFrom({ ...post, resultFingerPrint: fingerprint });
}

describe('validateCallbackFingerprint', () => {
  it('accepts a correctly signed payload', () => {
    expect(validateCallbackFingerprint(token, signedPayload())).toBe(true);
  });

  it('rejects a tampered amount', () => {
    const payload = { ...signedPayload(), amount: '9999' };

    expect(validateCallbackFingerprint(token, payload)).toBe(false);
  });

  it('rejects a fingerprint of a different length', () => {
    const payload = { ...signedPayload(), fingerprint: 'short' };

    expect(validateCallbackFingerprint(token, payload)).toBe(false);
  });

  it('rejects a payload signed with another posAutCode', () => {
    expect(validateCallbackFingerprint(computeToken('other-code'), signedPayload())).toBe(false);
  });
});
