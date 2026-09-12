import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { createPrismaStorage } from '../../src/infrastructure/storage/prisma';
import { runStorageContract } from './contract';
import { resolvePrismaCli } from './prisma/cli';

const schemaPath = new URL('./prisma/fixture.prisma', import.meta.url).pathname;
const sqlPath = new URL('./prisma/create-tables.sql', import.meta.url).pathname;
const dbPath = join(tmpdir(), `sisp-contract-${process.pid}.db`);
const prismaCli = resolvePrismaCli(import.meta.url);

const unverified =
  'PrismaStorage (sqlite) NOT VERIFIED: the Prisma CLI could not be resolved from this checkout, so the storage contract did not run';

if (prismaCli === null) {
  process.stderr.write(`${unverified}\n`);

  describe('PrismaStorage (sqlite)', () => {
    test(unverified, (context) => {
      context.skip(unverified);
    });
  });
} else {
  let clientDir = '';

  describe('PrismaStorage (sqlite)', () => {
    beforeAll(() => {
      clientDir = mkdtempSync(join(tmpdir(), 'sisp-prisma-client-'));

      process.env.PRISMA_TEST_DATABASE_URL = `file:${dbPath}`;
      process.env.PRISMA_TEST_CLIENT_OUTPUT = clientDir;

      execFileSync(process.execPath, [prismaCli, 'generate', '--schema', schemaPath], {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const sql = readFileSync(sqlPath, 'utf8');
      const db = new Database(dbPath);

      db.exec(sql);
      db.close();
    }, 60_000);

    afterAll(() => {
      rmSync(clientDir, { recursive: true, force: true });
      rmSync(dbPath, { force: true });
    });

    runStorageContract(async () => {
      const { PrismaClient } = await import(pathToFileURL(join(clientDir, 'index.js')).href);
      const prisma = new PrismaClient();

      await prisma.$connect();

      return createPrismaStorage(prisma, DEFAULT_TABLES, 'app-key', { provider: 'sqlite' });
    });
  });
}
