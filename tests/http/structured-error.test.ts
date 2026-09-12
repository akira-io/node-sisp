import { describe, expect, it } from 'vitest';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import {
  callbackErrorFrom,
  structuredErrorFrom,
} from '../../src/infrastructure/http/payment-response';
import type { TransactionAttemptRecord } from '../../src/infrastructure/storage/knex/records';

const declinePost = {
  messageType: '6',
  merchantRespErrorCode: 'C',
  merchantRespErrorDetail: 'Insufficient funds',
  merchantRespErrorDescription: 'Transaction processed with error',
  merchantRespAdditionalErrorMessage: 'Saldo do cartão insuficiente',
};

describe('structuredErrorFrom', () => {
  it('returns null for a successful callback', () => {
    expect(
      structuredErrorFrom(callbackPayloadFrom({ messageType: '8', merchantRespTid: 'TID-1' })),
    ).toBeNull();
  });

  it('does not call a success an error just because it carries a customer message', () => {
    expect(
      structuredErrorFrom(
        callbackPayloadFrom({
          messageType: '8',
          merchantRespAdditionalErrorMessage: 'Aviso do emissor',
        }),
      ),
    ).toBeNull();
  });

  it('carries the fields SISP sends on a decline', () => {
    const error = structuredErrorFrom(callbackPayloadFrom(declinePost));

    expect(error).toEqual({
      code: 'C',
      description: 'Transaction processed with error',
      detail: 'Insufficient funds',
      customerMessage: 'Saldo do cartão insuficiente',
    });
  });
});

describe('callbackErrorFrom', () => {
  it('reads the error off the stored callback payload', () => {
    const attempt = {
      callback_payload: callbackPayloadFrom(declinePost),
    } as unknown as TransactionAttemptRecord;

    expect(callbackErrorFrom(attempt)?.customerMessage).toBe('Saldo do cartão insuficiente');
  });

  it('returns null for a stored successful callback', () => {
    const attempt = {
      callback_payload: callbackPayloadFrom({ messageType: '8', merchantRespTid: 'TID-1' }),
    } as unknown as TransactionAttemptRecord;

    expect(callbackErrorFrom(attempt)).toBeNull();
  });

  it.each([
    null,
    undefined,
    'a string',
    42,
    [],
  ])('returns null for a stored callback payload of %s', (stored) => {
    expect(
      callbackErrorFrom({ callback_payload: stored } as unknown as TransactionAttemptRecord),
    ).toBeNull();
  });

  it('returns null without an attempt', () => {
    expect(callbackErrorFrom(null)).toBeNull();
  });
});
