import { describe, expect, it } from 'vitest';
import {
  booleanFromInput,
  isAlreadyProcessed,
} from '../../src/infrastructure/http/callback-processing';
import type { Transaction } from '../../src/infrastructure/storage/knex/models/transaction';
import type { TransactionAttempt } from '../../src/infrastructure/storage/knex/models/transaction-attempt';

const callback = {
  merchantRef: 'R1',
  merchantSession: 'S1',
  transactionID: 'TID-1',
  messageType: '8',
};

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
  it('returns true when the matching attempt already recorded the same gateway transaction', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel(null),
        attemptModel({ status: 'failed', gateway_transaction_id: 'TID-1', message_type: '8' }),
        callback,
      ),
    ).resolves.toBe(true);
  });

  it('returns true when the matching attempt is completed', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel(null),
        attemptModel({ status: 'completed', gateway_transaction_id: 'TID-0', message_type: '8' }),
        callback,
      ),
    ).resolves.toBe(true);
  });

  it('returns false when a failed attempt receives a different gateway transaction', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel(null),
        attemptModel({ status: 'failed', gateway_transaction_id: 'TID-0', message_type: '6' }),
        callback,
      ),
    ).resolves.toBe(false);
  });

  it('lets a final callback through when a pending attempt already holds the same gateway id', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel(null),
        attemptModel({ status: 'pending', gateway_transaction_id: 'TID-1', message_type: 'Z' }),
        callback,
      ),
    ).resolves.toBe(false);
  });

  it('returns false when the matching attempt is still pending', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel({ status: 'completed', transaction_id: 'TID-1', message_type: '8' }),
        attemptModel({ status: 'pending', gateway_transaction_id: null, message_type: null }),
        callback,
      ),
    ).resolves.toBe(false);
  });

  it('falls back to the transaction when no attempt exists', async () => {
    await expect(
      isAlreadyProcessed(
        transactionModel({ status: 'failed', transaction_id: 'TID-1', message_type: '8' }),
        attemptModel(null),
        callback,
      ),
    ).resolves.toBe(true);
    await expect(
      isAlreadyProcessed(
        transactionModel({ status: 'completed', transaction_id: 'TID-0', message_type: '8' }),
        attemptModel(null),
        callback,
      ),
    ).resolves.toBe(true);
    await expect(
      isAlreadyProcessed(
        transactionModel({ status: 'failed', transaction_id: 'TID-0', message_type: '6' }),
        attemptModel(null),
        callback,
      ),
    ).resolves.toBe(false);
  });

  it('returns false when neither attempt nor transaction exists', async () => {
    await expect(
      isAlreadyProcessed(transactionModel(null), attemptModel(null), callback),
    ).resolves.toBe(false);
  });
});

function attemptModel(
  record: {
    status: string;
    gateway_transaction_id: string | null;
    message_type: string | null;
  } | null,
): TransactionAttempt {
  return {
    findByRefAndSession: async () => record,
  } as unknown as TransactionAttempt;
}

function transactionModel(
  record: { status: string; transaction_id: string | null; message_type: string | null } | null,
): Transaction {
  return {
    findByRefAndSession: async () => record,
  } as unknown as Transaction;
}
