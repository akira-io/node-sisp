import type { SispTables } from '../../../application/config';
import type { SispStorage } from '../../../core/contracts/storage';

export type PrismaSqlProvider = 'postgresql' | 'mysql' | 'sqlite';

export function createPrismaStorage(
  _prisma: unknown,
  _tables: SispTables | undefined,
  _appKey: string | null,
  _options: { provider: PrismaSqlProvider },
): SispStorage {
  throw new Error('createPrismaStorage is not implemented yet.');
}
