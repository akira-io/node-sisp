import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'express/index': 'src/express/index.ts',
    'fastify/index': 'src/fastify/index.ts',
    'nest/index': 'src/nest/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    entry: {
      index: 'src/index.ts',
      'express/index': 'src/express/index.ts',
      'fastify/index': 'src/fastify/index.ts',
      'nest/index': 'src/nest/index.ts',
    },
  },
  sourcemap: true,
  clean: true,
  target: 'node20',
});
