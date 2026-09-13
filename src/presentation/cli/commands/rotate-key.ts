import { parseArgs } from 'node:util';
import type { RotateEncryptionKeyResult } from '../../../application/actions/rotate-encryption-key';
import { createSisp } from '../../../application/create-sisp';
import { type CliOptions, loadConfigFile, positiveInteger } from '../support';

export const ROTATE_KEY_INCOMPLETE = 2;

export async function rotateKey(
  argv: string[],
  options: CliOptions,
  output: (line: string) => void,
): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      batch: { type: 'string' },
    },
  });

  const batch = positiveInteger(values.batch, 'batch');

  const config = await (options.loadConfig ?? loadConfigFile)();
  const sisp = await createSisp(config);

  try {
    return report(await sisp.rotateEncryptionKey({ batch }), output);
  } finally {
    await sisp.destroy();
  }
}

type RowOutcome = Exclude<
  keyof RotateEncryptionKeyResult,
  'processed' | 'rewritten' | 'unreadableValues'
>;

const OUTCOME_LABELS: readonly [RowOutcome, string][] = [
  ['current', 'already encrypted under the current appKey'],
  ['plaintext', 'never encrypted and left unchanged'],
  ['unreadable', 'unreadable with the configured keys and left unchanged'],
  ['vanished', 'deleted while the rotation ran'],
];

function report(result: RotateEncryptionKeyResult, output: (line: string) => void): number {
  output(`Rewrote ${result.rewritten} of ${result.processed} rows onto the current appKey.`);

  for (const [key, label] of OUTCOME_LABELS) {
    const count = result[key];

    if (count > 0) {
      output(`${count} ${rows(count)} ${label}.`);
    }
  }

  const { unreadableValues } = result;

  if (unreadableValues.length === 0) {
    return 0;
  }

  output(
    `${unreadableValues.length} encrypted ${values(unreadableValues.length)} could not be read:`,
  );

  for (const failure of unreadableValues) {
    output(`  ${failure.table}#${failure.id} (${failure.column}): ${failure.reason}`);
  }

  output('Keep the old key in previousAppKeys until no values are reported here.');

  return ROTATE_KEY_INCOMPLETE;
}

function rows(count: number): string {
  return count === 1 ? 'row was' : 'rows were';
}

function values(count: number): string {
  return count === 1 ? 'value' : 'values';
}
