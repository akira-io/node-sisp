import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import { PayloadCipher } from '../../../src/infrastructure/storage/knex/encryption';
import type { PrismaClientLike } from '../../../src/infrastructure/storage/prisma/client';
import { makeTransactionRepository } from '../../../src/infrastructure/storage/prisma/repositories/transaction';

const cipher = new PayloadCipher(null);

function fakeTxClient(updateSpy: ReturnType<typeof vi.fn>): PrismaClientLike {
  const transactionRow = {
    id: 1n,
    merchantRef: 'REF',
    merchantSession: 'SESSION',
    amountCents: 1000n,
    status: 'pending',
    payload: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const transactionDelegate = {
    findFirst: vi.fn().mockResolvedValue(transactionRow),
    update: updateSpy,
  };

  const logDelegate = {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };

  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    sispTransaction: transactionDelegate,
    sispTransactionLog: logDelegate,
  } as unknown as PrismaClientLike;
}

describe('repository against an interactive tx client without $transaction', () => {
  it('runs update without throwing', async () => {
    const updateSpy = vi.fn().mockResolvedValue({});
    const client = fakeTxClient(updateSpy);

    expect(client.$transaction).toBeUndefined();

    const repo = makeTransactionRepository(client, DEFAULT_TABLES, cipher, 'sqlite');

    await expect(repo.update(1, { status: 'completed' })).resolves.toBeDefined();

    expect(updateSpy).toHaveBeenCalledOnce();

    const updateArg = updateSpy.mock.calls[0]?.[0] as { data: Record<string, unknown> };

    expect(updateArg.data.status).toBe('completed');
  });
});
