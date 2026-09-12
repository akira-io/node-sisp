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

  it('returns null without a stored callback', () => {
    expect(callbackErrorFrom(null)).toBeNull();
    expect(
      callbackErrorFrom({ callback_payload: null } as unknown as TransactionAttemptRecord),
    ).toBeNull();
  });
});
