import type { SispTables } from '../../../../application/config';
import type { DrizzleDialect } from '../migrations';
import { mysqlSispSchema } from './mysql';
import { postgresSispSchema } from './postgres';
import { sqliteSispSchema } from './sqlite';
import type { SispDrizzleSchema } from './types';

export { mysqlSispSchema } from './mysql';
export { postgresSispSchema } from './postgres';
export { sqliteSispSchema } from './sqlite';
export type { SispDrizzleSchema, SispSchemaTable } from './types';

export function sispDrizzleSchema(dialect: DrizzleDialect, tables: SispTables): SispDrizzleSchema {
  switch (dialect) {
    case 'postgresql':
      return postgresSispSchema(tables);
    case 'mysql':
      return mysqlSispSchema(tables);
    default:
      return sqliteSispSchema(tables);
  }
}
