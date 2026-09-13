import { parseArgs } from 'node:util';
import { createSisp } from '../../../application/create-sisp';
import { type CliOptions, loadConfigFile, positiveInteger } from '../support';

export async function reconcilePending(
  argv: string[],
  options: CliOptions,
  output: (line: string) => void,
): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'older-than': { type: 'string' },
      limit: { type: 'string' },
      force: { type: 'boolean' },
    },
  });

  const olderThanMinutes = positiveInteger(values['older-than'], 'older-than');
  const limit = positiveInteger(values.limit, 'limit');

  const config = await (options.loadConfig ?? loadConfigFile)();
  const sisp = await createSisp(config);

  try {
    const result = await sisp.reconcilePending({
      olderThanMinutes,
      limit,
      force: values.force ?? false,
    });

    if (result.skipped) {
      output('SISP transaction reconciliation is disabled. Use --force to run anyway.');

      return 0;
    }

    if (result.checked === 0) {
      output('No pending SISP transactions require reconciliation.');

      return 0;
    }

    output(`Reconciled ${result.reconciled} of ${result.checked} pending SISP transactions.`);

    return 0;
  } finally {
    await sisp.destroy();
  }
}
