import type { SispTables } from '../../../../application/config';
import type { PayloadCipher } from '../../knex/encryption';
import type { DrizzleConnection } from '../client';
import { TableGateway } from '../queries';
import type { SispTableKey } from '../schema/spec';
import type { SispDrizzleSchema } from '../schema/types';

export interface RepositoryContext {
  connection: DrizzleConnection;
  schema: SispDrizzleSchema;
  tables: SispTables;
  cipher: PayloadCipher;
}

export function gateway(context: RepositoryContext, key: SispTableKey): TableGateway {
  return new TableGateway(context.connection, context.schema, key);
}

export function scopedContext(
  context: RepositoryContext,
  connection: DrizzleConnection,
): RepositoryContext {
  return { ...context, connection };
}
