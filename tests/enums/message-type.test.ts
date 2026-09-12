import { describe, expect, it } from 'vitest';
import { mapTransactionStatus } from '../../src/application/actions/map-transaction-status';
import {
  isErrorMessageType,
  isSuccessMessageType,
  MessageType,
  SUCCESS_MESSAGE_TYPES,
} from '../../src/domain/enums/message-type';
import { TransactionStatus } from '../../src/domain/enums/transaction-status';

describe('message types', () => {
  it('carries the closed set the protocol defines', () => {
    expect(SUCCESS_MESSAGE_TYPES).toEqual(['8', 'P', 'M', 'A', 'B', 'C', '10', '?']);
    expect(MessageType.Error).toBe('6');
  });

  it.each([
    '8',
    'P',
    'M',
    'A',
    'B',
    'C',
    '10',
    '?',
  ])('recognises %s as a success type', (messageType) => {
    expect(isSuccessMessageType(messageType)).toBe(true);
    expect(isErrorMessageType(messageType)).toBe(false);
  });

  it('does not treat the error type as a success type', () => {
    expect(isSuccessMessageType('6')).toBe(false);
    expect(isErrorMessageType('6')).toBe(true);
  });

  it.each([
    '1',
    '3',
    '5',
    '12',
    '51',
    '55',
  ])('rejects the ISO-8583 response code %s as a message type', (code) => {
    expect(isSuccessMessageType(code)).toBe(false);
    expect(isErrorMessageType(code)).toBe(false);
  });
});

describe('mapTransactionStatus', () => {
  it.each(['8', 'P', 'M', 'A', 'B', 'C', '10', '?'])('maps %s to completed', (messageType) => {
    expect(mapTransactionStatus(messageType)).toBe(TransactionStatus.Completed);
  });

  it('maps the error type to failed', () => {
    expect(mapTransactionStatus(MessageType.Error)).toBe(TransactionStatus.Failed);
  });

  it.each(['', 'Z', '2', '51', null, undefined])('maps %s to pending', (messageType) => {
    expect(mapTransactionStatus(messageType)).toBe(TransactionStatus.Pending);
  });
});
