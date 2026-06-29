import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../src/database/models/transaction';
import type { TransactionAttempt } from '../../src/database/models/transaction-attempt';
import { booleanFromInput, isAlreadyProcessed } from '../../src/http/callback-processing';

describe('booleanFromInput', () => {
  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    ['1', true],
    ['true', true],
    ['on', true],
    ['yes', true],
    ['TRUE', true],
    ['0', false],
    ['false', false],
    [undefined, false],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(booleanFromInput(input)).toBe(expected);
  });
});

describe('isAlreadyProcessed', () => {
  it('returns true when the matching attempt already has a gateway transaction id', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel(null),
        attemptModel({ gateway_transaction_id: 'TID-1' }),
        'R1',
        'S1',
      ),
    ).resolves.toBe(true);
  });

  it('returns false when the matching attempt is still pending', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel({ transaction_id: 'TID-1' }),
        attemptModel({ gateway_transaction_id: null }),
        'R1',
        'S1',
      ),
    ).resolves.toBe(false);
  });

  it('falls back to transaction state when no attempt exists', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel({ transaction_id: 'TID-1' }),
        attemptModel(null),
        'R1',
        'S1',
      ),
    ).resolves.toBe(true);
  });

  it('returns false when neither attempt nor transaction has processed state', async () => {
    await expect(
      isAlreadyProcessed(transactionModel(null), attemptModel(null), 'R1', 'S1'),
    ).resolves.toBe(false);
  });
});

function attemptModel(
  record: { gateway_transaction_id: string | null } | null,
): TransactionAttempt {
  return {
    findByRefAndSession: async () => record,
  } as unknown as TransactionAttempt;
}

function transactionModel(record: { transaction_id: string | null } | null): Transaction {
  return {
    findByRefAndSession: async () => record,
  } as unknown as Transaction;
}
