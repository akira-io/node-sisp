import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveConfig, type SispConfig } from '../../application/config';
import { createSisp } from '../../application/create-sisp';
import { runMigrations } from '../../infrastructure/storage/knex/auto-migrate';
import { createKnexInstance } from '../../infrastructure/storage/knex/create-knex';

export interface CliOptions {
  loadConfig?: () => Promise<SispConfig>;
  output?: (line: string) => void;
  schemaPath?: string;
}

const CONFIG_FILES = ['sisp.config.js', 'sisp.config.mjs', 'sisp.config.cjs', 'sisp.config.json'];

export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  const output = options.output ?? writeStdout;
  const [command, ...rest] = argv;

  if (command === 'migrate') {
    return migrate(rest, options, output);
  }

  if (command === 'reconcile-pending') {
    return reconcilePending(rest, options, output);
  }

  if (command === 'prisma') {
    return prismaSchema(rest, options, output);
  }

  output('Usage: sisp <command>');
  output('');
  output('Commands:');
  output('  migrate                Run the bundled SISP migrations');
  output('  reconcile-pending      Reconcile old pending transactions via the status API');
  output('                         [--older-than <minutes>] [--limit <n>] [--force]');
  output('  prisma                 Copy the reference Prisma schema into your project');
  output('                         [--out <path>] [--print] [--models-only] [--force]');

  return command === undefined || command === 'help' || command === '--help' ? 0 : 1;
}

export async function loadConfigFile(cwd: string = process.cwd()): Promise<SispConfig> {
  for (const fileName of CONFIG_FILES) {
    const filePath = join(cwd, fileName);

    if (!(await exists(filePath))) {
      continue;
    }

    if (fileName.endsWith('.json')) {
      return JSON.parse(await readFile(filePath, 'utf8')) as SispConfig;
    }

    const module = (await import(pathToFileURL(filePath).href)) as {
      default?: SispConfig;
      config?: SispConfig;
    };

    const config = module.default ?? module.config;

    if (!config) {
      throw new Error(`${fileName} must export the SISP configuration as its default export.`);
    }

    return config;
  }

  throw new Error(
    `No SISP configuration found. Create one of: ${CONFIG_FILES.join(', ')} in ${cwd}.`,
  );
}

async function migrate(
  _argv: string[],
  options: CliOptions,
  output: (line: string) => void,
): Promise<number> {
  const config = await (options.loadConfig ?? loadConfigFile)();
  const resolved = resolveConfig(config);

  if (!resolved.database) {
    throw new Error('The `migrate` command requires a `database` configuration.');
  }

  const db = createKnexInstance(resolved.database);

  try {
    const ran = await runMigrations(db, resolved.tables);

    if (ran.length === 0) {
      output('Nothing to migrate.');

      return 0;
    }

    for (const name of ran) {
      output(`Migrated: ${name}`);
    }

    return 0;
  } finally {
    await db.destroy();
  }
}

async function reconcilePending(
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

  const config = await (options.loadConfig ?? loadConfigFile)();
  const sisp = await createSisp(config);

  try {
    const result = await sisp.reconcilePending({
      olderThanMinutes: values['older-than'] ? Number(values['older-than']) : undefined,
      limit: values.limit ? Number(values.limit) : undefined,
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

async function prismaSchema(
  argv: string[],
  options: CliOptions,
  output: (line: string) => void,
): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string' },
      print: { type: 'boolean' },
      'models-only': { type: 'boolean' },
      force: { type: 'boolean' },
    },
  });

  const sourcePath =
    options.schemaPath ?? new URL('../prisma/sisp.prisma', import.meta.url).pathname;

  let schema = await readFile(sourcePath, 'utf8');

  if (values['models-only']) {
    schema = schema
      .replace(/^(datasource|generator)\s+\w+\s*\{[^}]*\}\s*/gm, '')
      .replace(/^\n+/, '');
  }

  if (values.print) {
    output(schema);

    return 0;
  }

  const outRel = values.out ?? join('prisma', 'sisp.prisma');
  const dest = isAbsolute(outRel) ? outRel : join(process.cwd(), outRel);

  if (!values.force && (await exists(dest))) {
    output(`Refusing to overwrite ${dest}. Use --force to replace it.`);

    return 1;
  }

  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, schema, 'utf8');
  output(`Wrote ${dest}`);

  return 0;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);

    return true;
  } catch {
    return false;
  }
}

function writeStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}
