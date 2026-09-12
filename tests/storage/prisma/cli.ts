import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

type PrismaManifest = {
  bin?: string | Record<string, string>;
};

export function resolvePrismaCli(from: string): string | null {
  let manifestPath: string;

  try {
    manifestPath = createRequire(from).resolve('prisma/package.json');
  } catch {
    return null;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PrismaManifest;
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.prisma;

  if (bin === undefined) {
    return null;
  }

  return join(dirname(manifestPath), bin);
}
