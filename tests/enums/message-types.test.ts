import { describe, expect, it } from 'vitest';
import { mapTransactionStatus } from '../../src/actions/map-transaction-status';
import {
  ERROR_MESSAGE_TYPE_VALUES,
  errorActionLabel,
  errorCategoryLabel,
  errorMessageTypeFromValue,
  errorMessageTypeLabel,
} from '../../src/enums/error-message-type';
import {
  SUCCESS_MESSAGE_TYPE_VALUES,
  successMessageTypeFromValue,
  successMessageTypeLabel,
} from '../../src/enums/success-message-type';
import { TransactionStatus } from '../../src/enums/transaction-status';

describe('error message types', () => {
  it('ports all 36 SISP error codes', () => {
    expect(ERROR_MESSAGE_TYPE_VALUES).toHaveLength(36);
  });

  it('maps insufficient funds to the funds category with a card-change action', () => {
    const type = errorMessageTypeFromValue('51');

    expect(type).not.toBeNull();
    expect(type?.key).toBe('insufficientFunds');
    expect(type?.category).toBe('funds');
    expect(type?.action).toBe('use-different-card');
  });

  it('translates labels in EN, PT, and FR', () => {
    const type = errorMessageTypeFromValue('51');

    if (type === null) {
      throw new Error('expected error type 51');
    }

    expect(errorMessageTypeLabel(type, 'en')).toBe('Insufficient funds');
    expect(errorMessageTypeLabel(type, 'PT')).toBe('Saldo insuficiente');
    expect(errorMessageTypeLabel(type, 'fr')).toBe('Fonds insuffisants');
    expect(errorCategoryLabel(type, 'en')).toBe('Insufficient Funds');
    expect(errorActionLabel(type, 'en')).toBe('Use a different card');
  });

  it('falls back to EN for unknown languages', () => {
    const type = errorMessageTypeFromValue('99');

    if (type === null) {
      throw new Error('expected error type 99');
    }

    expect(errorMessageTypeLabel(type, 'de')).toBe(errorMessageTypeLabel(type, 'en'));
  });

  it('returns null for unknown values', () => {
    expect(errorMessageTypeFromValue('not-a-code')).toBeNull();
  });
});

describe('success message types', () => {
  it('ports the six success codes', () => {
    expect(SUCCESS_MESSAGE_TYPE_VALUES).toEqual(['8', 'P', 'M', 'A', 'B', 'C']);
  });

  it('translates success labels', () => {
    const type = successMessageTypeFromValue('8');

    if (type === null) {
      throw new Error('expected success type 8');
    }

    expect(successMessageTypeLabel(type, 'en')).toBe('Purchase');
  });
});

describe('mapTransactionStatus', () => {
  it.each(['8', 'P', 'M', 'A', 'B', 'C', '10'])('maps %s to completed', (messageType) => {
    expect(mapTransactionStatus(messageType)).toBe(TransactionStatus.Completed);
  });

  it.each(ERROR_MESSAGE_TYPE_VALUES)('maps error %s to failed', (messageType) => {
    expect(mapTransactionStatus(messageType)).toBe(TransactionStatus.Failed);
  });

  it.each(['', 'Z', '2', null, undefined])('maps %s to pending', (messageType) => {
    expect(mapTransactionStatus(messageType)).toBe(TransactionStatus.Pending);
  });
});
