import { describe, expect, it } from 'vitest';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import {
  generateCallbackFingerprint,
  validateCallbackFingerprint,
} from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { sha512Base64 } from '../../src/infrastructure/fingerprints/hash';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import vectors from '../fixtures/error-callback-vectors.json';

const [decline] = vectors.callback;

if (decline === undefined) {
  throw new Error('expected at least one error callback vector');
}

function specFingerprint(posAutCode: string, post: Record<string, string>): string {
  return sha512Base64(
    sha512Base64(posAutCode) +
      post.messageType +
      post.merchantRespMessageID +
      post.merchantRespErrorCode +
      post.merchantRespErrorDetail +
      post.merchantRespErrorDescription +
      post.merchantRespMerchantRef +
      post.merchantRespMerchantSession +
      post.merchantRespAdditionalErrorMessage +
      post.merchantRespTimeStamp,
  );
}

describe('error callback fingerprint', () => {
  it.each(
    vectors.callback,
  )('agrees with section 2.4.2.2 spelled out independently for $post.merchantRespMerchantRef', ({
    posAutCode,
    post,
    fingerprint,
  }) => {
    expect(specFingerprint(posAutCode, post)).toBe(fingerprint);
  });

  it.each(vectors.callback)('matches the specification vector for $post.merchantRespMerchantRef', ({
    posAutCode,
    post,
    fingerprint,
  }) => {
    const payload = callbackPayloadFrom({ ...post, resultFingerPrint: fingerprint });

    expect(generateCallbackFingerprint(computeToken(posAutCode), payload)).toBe(fingerprint);
    expect(validateCallbackFingerprint(computeToken(posAutCode), payload)).toBe(true);
  });

  it('does not accept a decline signed with the success formula', () => {
    const token = computeToken('TEST_POS_AUT_CODE');
    const post = { ...decline.post };
    const successStyle = callbackPayloadFrom({ ...post, messageType: '8' });
    const declined = callbackPayloadFrom({
      ...post,
      resultFingerPrint: generateCallbackFingerprint(token, successStyle),
    });

    expect(validateCallbackFingerprint(token, declined)).toBe(false);
  });

  it.each([
    'merchantRespMessageID',
    'merchantRespMerchantSession',
    'merchantRespErrorCode',
    'merchantRespErrorDetail',
    'merchantRespErrorDescription',
    'merchantRespAdditionalErrorMessage',
    'merchantRespMerchantRef',
    'merchantRespTimeStamp',
  ])('rejects a decline with %s tampered', (field) => {
    const { posAutCode, post, fingerprint } = decline;
    const payload = callbackPayloadFrom({
      ...post,
      [field]: 'tampered',
      resultFingerPrint: fingerprint,
    });

    expect(validateCallbackFingerprint(computeToken(posAutCode), payload)).toBe(false);
  });

  it('ignores the fields the error formula does not cover', () => {
    const { posAutCode, post, fingerprint } = decline;
    const payload = callbackPayloadFrom({
      ...post,
      merchantRespPurchaseAmount: '999999',
      merchantRespPan: '****1234',
      merchantRespTid: 'T-INVENTED',
      resultFingerPrint: fingerprint,
    });

    expect(validateCallbackFingerprint(computeToken(posAutCode), payload)).toBe(true);
  });
});
