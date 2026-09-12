import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { resolvePrismaCli } from './prisma/cli';

describe('resolvePrismaCli', () => {
  test('resolves a Prisma CLI that exists on disk', () => {
    const cli = resolvePrismaCli(import.meta.url);

    expect(cli).toBeTypeOf('string');
    expect(existsSync(String(cli))).toBe(true);
  });

  test('resolves from a directory that holds no node_modules of its own', () => {
    const nested = new URL('../../src/infrastructure/storage/probe.js', import.meta.url);

    expect(existsSync(new URL('./node_modules', nested))).toBe(false);
    expect(resolvePrismaCli(nested.href)).toBe(resolvePrismaCli(import.meta.url));
  });

  test('returns null when no node_modules above the caller holds prisma', () => {
    const outside = mkdtempSync(join(tmpdir(), 'sisp-prisma-resolve-'));

    try {
      expect(resolvePrismaCli(pathToFileURL(join(outside, 'probe.js')).href)).toBeNull();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
