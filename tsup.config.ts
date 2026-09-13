import { defineConfig } from 'tsup';

const entry = {
  index: 'src/index.ts',
  'express/index': 'src/presentation/express/index.ts',
  'fastify/index': 'src/presentation/fastify/index.ts',
  'nest/index': 'src/presentation/nest/index.ts',
  'prisma/index': 'src/infrastructure/storage/prisma/index.ts',
  'knex/index': 'src/infrastructure/storage/knex/index.ts',
  'drizzle/index': 'src/infrastructure/storage/drizzle/index.ts',
};

export default defineConfig([
  {
    entry,
    format: ['esm', 'cjs'],
    dts: { entry },
    sourcemap: true,
    target: 'node20',
  },
  {
    entry: { cli: 'src/presentation/cli/cli.ts' },
    format: ['esm'],
    sourcemap: true,
    target: 'node20',
  },
]);
