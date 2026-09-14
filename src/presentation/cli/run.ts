import { migrate } from './commands/migrate';
import { prismaSchema } from './commands/prisma-schema';
import { pruneMetadata } from './commands/prune-metadata';
import { reconcilePending } from './commands/reconcile-pending';
import { rotateKey } from './commands/rotate-key';
import { type CliOptions, CliUsageError } from './support';

export type { CliOptions } from './support';
export { loadConfigFile } from './support';

type CommandHandler = (
  argv: string[],
  options: CliOptions,
  output: (line: string) => void,
) => Promise<number>;

interface CommandDefinition {
  handler: CommandHandler;
  usage: readonly string[];
}

const COMMANDS: Record<string, CommandDefinition> = {
  migrate: {
    handler: migrate,
    usage: ['  migrate                Run the bundled SISP migrations'],
  },
  'reconcile-pending': {
    handler: reconcilePending,
    usage: [
      '  reconcile-pending      Reconcile old pending transactions via the status API',
      '                         [--older-than <minutes>] [--limit <n>] [--force]',
    ],
  },
  prisma: {
    handler: prismaSchema,
    usage: [
      '  prisma                 Copy the reference Prisma schema into your project',
      '                         [--out <path>] [--print] [--models-only] [--force]',
    ],
  },
  'prune-metadata': {
    handler: pruneMetadata,
    usage: [
      '  prune-metadata         Delete request metadata older than a retention window',
      '                         [--older-than-days <n>] [--batch <n>] [--dry-run]',
    ],
  },
  'rotate-key': {
    handler: rotateKey,
    usage: [
      '  rotate-key             Re-encrypt stored payloads onto the current appKey',
      '                         [--batch <n>]',
    ],
  },
};

export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  const output = options.output ?? writeStdout;
  const [command, ...rest] = argv;
  const definition = command !== undefined ? COMMANDS[command] : undefined;

  try {
    if (definition) {
      return await definition.handler(rest, options, output);
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      output(error.message);

      return 1;
    }

    throw error;
  }

  output('Usage: sisp <command>');
  output('');
  output('Commands:');

  for (const definition of Object.values(COMMANDS)) {
    for (const line of definition.usage) {
      output(line);
    }
  }

  return command === undefined || command === 'help' || command === '--help' ? 0 : 1;
}

function writeStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}
