export interface PrismaDelegate {
  create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  findFirst(args?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown> | Record<string, unknown>[];
    take?: number;
    skip?: number;
    select?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null>;
  findMany(args?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown> | Record<string, unknown>[];
    take?: number;
    skip?: number;
    select?: Record<string, unknown>;
  }): Promise<Record<string, unknown>[]>;
  update(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
  delete(args: { where: Record<string, unknown> }): Promise<Record<string, unknown>>;
  deleteMany(args?: { where?: Record<string, unknown> }): Promise<{ count: number }>;
  aggregate(args: {
    where?: Record<string, unknown>;
    _max?: Record<string, true>;
  }): Promise<Record<string, unknown>>;
}

export interface PrismaClientLike {
  $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
  $transaction?<T>(work: (txc: PrismaClientLike) => Promise<T>): Promise<T>;
  $disconnect?(): Promise<void>;
}

export function runInTransaction<T>(
  client: PrismaClientLike,
  fn: (txc: PrismaClientLike) => Promise<T>,
): Promise<T> {
  if (typeof client.$transaction === 'function') {
    return client.$transaction(fn);
  }

  return fn(client);
}

export const DELEGATE_NAMES = {
  transactions: 'sispTransaction',
  transactionItems: 'sispTransactionItem',
  transactionAttempts: 'sispTransactionAttempt',
  paymentIntents: 'sispPaymentIntent',
  invoices: 'sispInvoice',
  transactionLogs: 'sispTransactionLog',
  blacklist: 'sispBlacklist',
  rateLimits: 'sispRateLimit',
  requestMetadata: 'sispRequestMetadata',
} as const;

export function delegate(client: PrismaClientLike, name: string): PrismaDelegate {
  return (client as unknown as Record<string, PrismaDelegate>)[name] as PrismaDelegate;
}

export function rawExec(client: PrismaClientLike): (query: string, ...values: unknown[]) => Promise<unknown> {
  return client.$queryRawUnsafe.bind(client);
}
