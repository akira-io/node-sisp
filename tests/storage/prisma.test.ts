import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { beforeAll, describe } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { createPrismaStorage } from '../../src/infrastructure/storage/prisma';
import { runStorageContract } from './contract';

const schemaPath = new URL('./prisma/fixture.prisma', import.meta.url).pathname;
const sqlPath = new URL('./prisma/create-tables.sql', import.meta.url).pathname;
const dbPath = join(tmpdir(), `sisp-contract-${process.pid}.db`);
const prismaBin = new URL('../../node_modules/.bin/prisma', import.meta.url).pathname;

describe('PrismaStorage (sqlite)', () => {
  beforeAll(() => {
    process.env.PRISMA_TEST_DATABASE_URL = `file:${dbPath}`;

    execFileSync(prismaBin, ['generate', '--schema', schemaPath], {
      stdio: 'pipe',
      env: { ...process.env },
    });

    const sql = readFileSync(sqlPath, 'utf8');
    const db = new Database(dbPath);

    db.exec(sql);
    db.close();
  }, 60_000);

  runStorageContract(async () => {
    const { PrismaClient } = await import('../../node_modules/.prisma/sisp-test/index.js');
    const prisma = new PrismaClient();

    await prisma.$connect();

    return createPrismaStorage(prisma, DEFAULT_TABLES, 'app-key', { provider: 'sqlite' });
  });
});
