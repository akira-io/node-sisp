import type { Knex } from 'knex';
import type { SispDatabaseConfig } from '../../../application/config';

export interface SispKnexDatabaseConfig extends Omit<SispDatabaseConfig, 'connection'> {
  connection: NonNullable<Knex.Config['connection']>;
}
