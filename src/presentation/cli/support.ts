import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SispConfig } from '../../application/config';
import { MAX_BATCH } from '../../application/options';

export interface CliOptions {
  loadConfig?: () => Promise<SispConfig>;
  output?: (line: string) => void;
  schemaPath?: string;
}

const CONFIG_FILES = ['sisp.config.js', 'sisp.config.mjs', 'sisp.config.cjs', 'sisp.config.json'];

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

export class CliUsageError extends Error {}

function integerWithin(
  value: string | undefined,
  flag: string,
  min: number,
  max: number,
  description: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new CliUsageError(`--${flag} expects ${description}, received "${value}".`);
  }

  return parsed;
}

export function positiveInteger(value: string | undefined, flag: string): number | undefined {
  return integerWithin(value, flag, 1, Number.MAX_SAFE_INTEGER, 'a positive integer');
}

export function batchInteger(value: string | undefined, flag: string): number | undefined {
  return integerWithin(value, flag, 1, MAX_BATCH, `an integer between 1 and ${MAX_BATCH}`);
}

export function nonNegativeInteger(value: string | undefined, flag: string): number | undefined {
  return integerWithin(value, flag, 0, Number.MAX_SAFE_INTEGER, 'a non-negative integer');
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);

    return true;
  } catch {
    return false;
  }
}
