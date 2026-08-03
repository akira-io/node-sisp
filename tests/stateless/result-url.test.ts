import { describe, expect, it } from 'vitest';
import { CallbackRejectionReasons } from '../../src/domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../../src/domain/enums/transaction-status';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import {
  readStatelessResult,
  signStatelessResult,
  statelessResultData,
} from '../../src/infrastructure/http/stateless-result-url';
import { UrlSigner } from '../../src/support/signed-url';

const signer = new UrlSigner('app-key');
const PATH = '/sisp/callback';

describe('stateless result url', () => {
  it('round-trips a verified result', () => {
    const data = statelessResultData(
      callbackPayloadFrom({ merchantRespMerchantRef: 'REF123', messageType: '8' }),
      TransactionStatus.Completed,
      null,
      'pt',
    );
    const url = signStatelessResult(signer, PATH, data);
    const query = queryOf(url);

    expect(readStatelessResult(signer, PATH, query)).toEqual({
      merchant_ref: 'REF123',
      verified: true,
      status: TransactionStatus.Completed,
      reason: null,
      error: null,
    });
  });

  it('round-trips a verified-but-declined result with its own status', () => {
    const data = statelessResultData(
      callbackPayloadFrom({ merchantRespMerchantRef: 'REF123', messageType: '6' }),
      TransactionStatus.Failed,
      null,
      'pt',
    );
    const restored = readStatelessResult(
      signer,
      PATH,
      queryOf(signStatelessResult(signer, PATH, data)),
    );

    expect(restored?.verified).toBe(true);
    expect(restored?.reason).toBeNull();
    expect(restored?.status).toBe(TransactionStatus.Failed);
  });

  it('round-trips a rejected result with its structured error', () => {
    const data = statelessResultData(
      callbackPayloadFrom({ merchantRespMerchantRef: 'REF123', messageType: '6' }),
      TransactionStatus.Failed,
      CallbackRejectionReasons.DetailsMismatch,
      'en',
    );
    const restored = readStatelessResult(
      signer,
      PATH,
      queryOf(signStatelessResult(signer, PATH, data)),
    );

    expect(restored?.verified).toBe(false);
    expect(restored?.reason).toBe(CallbackRejectionReasons.DetailsMismatch);
    expect(restored?.error?.code).toBe('6');
  });

  it('rejects a tampered query', () => {
    const data = statelessResultData(
      callbackPayloadFrom({ merchantRespMerchantRef: 'REF123', messageType: '8' }),
      TransactionStatus.Completed,
      null,
      'pt',
    );
    const query = queryOf(signStatelessResult(signer, PATH, data));

    expect(readStatelessResult(signer, PATH, { ...query, verified: '0' })).toBeNull();
  });

  it('rejects a query with no signature', () => {
    expect(readStatelessResult(signer, PATH, { ref: 'REF123', verified: '1' })).toBeNull();
  });

  it('rejects a reason outside the known union', () => {
    const signedPath = signer.sign(PATH, {
      ref: 'REF123',
      verified: '0',
      status: TransactionStatus.Failed,
      messageType: '',
      reason: 'invented',
    });

    expect(readStatelessResult(signer, PATH, queryOf(signedPath))).toBeNull();
  });

  it('rejects a status outside the known union', () => {
    const signedPath = signer.sign(PATH, {
      ref: 'REF123',
      verified: '1',
      status: 'invented',
      messageType: '',
    });

    expect(readStatelessResult(signer, PATH, queryOf(signedPath))).toBeNull();
  });

  it('rejects a result url signed with an expiry already in the past', () => {
    const expiredAt = new Date(Date.now() - 60_000);
    const signedPath = signer.sign(
      PATH,
      { ref: 'REF123', verified: '1', status: TransactionStatus.Completed, messageType: '' },
      expiredAt,
    );

    expect(readStatelessResult(signer, PATH, queryOf(signedPath))).toBeNull();
  });
});

function queryOf(url: string): Record<string, string> {
  const params = new URLSearchParams(url.split('?')[1] ?? '');

  return Object.fromEntries(params.entries());
}
