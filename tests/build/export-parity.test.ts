import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ENTRIES = [
  'index',
  'express/index',
  'fastify/index',
  'nest/index',
  'prisma/index',
  'knex/index',
  'drizzle/index',
];

const FORMATS = [
  { name: 'esm', declaration: 'd.ts', bundle: 'js' },
  { name: 'cjs', declaration: 'd.cts', bundle: 'cjs' },
];

const CASES = FORMATS.flatMap((format) => ENTRIES.map((entry) => ({ ...format, entry })));

const require = createRequire(import.meta.url);

function distPath(file: string): string {
  return fileURLToPath(new URL(`../../dist/${file}`, import.meta.url));
}

const programs = new Map<string, ts.Program>();

function programFor(extension: string): ts.Program {
  const cached = programs.get(extension);

  if (cached) {
    return cached;
  }

  const program = ts.createProgram(
    ENTRIES.map((entry) => distPath(`${entry}.${extension}`)),
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    },
  );

  programs.set(extension, program);

  return program;
}

function declaredValueExports(entry: string, extension: string): string[] {
  const declaration = distPath(`${entry}.${extension}`);
  const program = programFor(extension);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(declaration);

  if (!source) {
    throw new Error(`${declaration} was not parsed. Run the build first.`);
  }

  const moduleSymbol = checker.getSymbolAtLocation(source);

  if (!moduleSymbol) {
    throw new Error(`${declaration} declares no module symbol.`);
  }

  return checker
    .getExportsOfModule(moduleSymbol)
    .filter((symbol) => {
      const resolved =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

      return (resolved.flags & ts.SymbolFlags.Value) !== 0;
    })
    .map((symbol) => symbol.name)
    .sort();
}

async function runtimeExports(entry: string, extension: string): Promise<string[]> {
  const loaded =
    extension === 'cjs'
      ? (require(distPath(`${entry}.cjs`)) as Record<string, unknown>)
      : ((await import(distPath(`${entry}.js`))) as Record<string, unknown>);

  return Object.keys(loaded)
    .filter((name) => name !== 'default' && name !== '__esModule')
    .sort();
}

describe('the built bundles and their declarations export the same values', () => {
  it.each(CASES)('dist/$entry as $name', async ({ entry, declaration, bundle }) => {
    const [declared, runtime] = [
      declaredValueExports(entry, declaration),
      await runtimeExports(entry, bundle),
    ];

    expect(runtime.filter((name) => !declared.includes(name))).toEqual([]);
    expect(declared.filter((name) => !runtime.includes(name))).toEqual([]);
  }, 30_000);

  it.each(
    FORMATS,
  )('$name declares the wire-format mappers a stateless consumer needs', (format) => {
    expect(declaredValueExports('index', format.declaration)).toEqual(
      expect.arrayContaining([
        'callbackPayloadFrom',
        'callbackPayloadToFormFields',
        'paymentRequestDataFrom',
        'paymentRequestToFormFields',
      ]),
    );
  }, 30_000);
});
