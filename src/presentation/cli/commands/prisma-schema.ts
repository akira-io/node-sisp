import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type CliOptions, exists } from '../support';

export async function prismaSchema(
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
    options.schemaPath ?? fileURLToPath(new URL('../prisma/sisp.prisma', import.meta.url));

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
