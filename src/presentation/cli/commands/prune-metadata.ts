import { parseArgs } from 'node:util';
import { createSisp } from '../../../application/create-sisp';
import { RetentionWindowError } from '../../../domain/errors/exceptions';
import {
  batchInteger,
  type CliOptions,
  CliUsageError,
  loadConfigFile,
  nonNegativeInteger,
} from '../support';

export async function pruneMetadata(
  argv: string[],
  options: CliOptions,
  output: (line: string) => void,
): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'older-than-days': { type: 'string' },
      batch: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });

  const olderThanDays = nonNegativeInteger(values['older-than-days'], 'older-than-days');
  const batch = batchInteger(values.batch, 'batch');

  const config = await (options.loadConfig ?? loadConfigFile)();
  const sisp = await createSisp(config);

  try {
    if (values['dry-run']) {
      const count = await sisp.countPrunableRequestMetadata({ olderThanDays });

      output(`Dry run: ${count} request metadata rows would be deleted.`);

      return 0;
    }

    const { deleted } = await sisp.pruneRequestMetadata({ olderThanDays, batch });

    output(`Deleted ${deleted} request metadata rows.`);

    return 0;
  } catch (error) {
    if (error instanceof RetentionWindowError) {
      throw new CliUsageError(error.message);
    }

    throw error;
  } finally {
    await sisp.destroy();
  }
}
