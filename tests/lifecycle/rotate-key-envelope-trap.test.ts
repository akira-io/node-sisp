import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../src/application/config';
import { createSisp } from '../../src/application/create-sisp';

const dir = mkdtempSync(join(tmpdir(), 'sisp-envelope-trap-'));
const CALLER_STRING = 'sisp.v2:oops';

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function sispWith(filename: string, appKey: string, previousAppKeys: string[] = []) {
  return createSisp({
    posId: '90051',
    posAutCode: 'code',
    appKey,
    previousAppKeys,
    allowWeakAppKey: true,
    database: {
      client: 'better-sqlite3' as const,
      connection: { filename },
      autoMigrate: true,
    },
  });
}

function storedMetadata(filename: string): string {
  const reader = new Database(filename, { readonly: true });

  try {
    const row = reader
      .prepare(`select custom_metadata from ${DEFAULT_TABLES.requestMetadata} limit 1`)
      .get() as { custom_metadata: string };

    return row.custom_metadata;
  } finally {
    reader.close();
  }
}

describe('a caller string that looks like an encrypted envelope', () => {
  it('is encrypted at rest, reads back, and never blocks a key rotation', async () => {
    const filename = join(dir, 'caller-envelope.db');
    const sisp = await sispWith(filename, 'old-key');
    let transactionId = 0;

    try {
      const transaction = await sisp.models.transactions.create({
        merchantRef: 'REF-TRAP-001',
        merchantSession: 'SES-TRAP-001',
        amount: 1000,
      });

      transactionId = transaction.id;

      await sisp.storage.requestMetadata.create({
        transaction_id: transactionId,
        ip_address: '203.0.113.7',
        custom_metadata: CALLER_STRING,
      });

      expect(storedMetadata(filename)).not.toContain('oops');

      const [metadata] = await sisp.storage.requestMetadata.listByTransaction(transactionId);

      expect(metadata?.custom_metadata).toBe(CALLER_STRING);
    } finally {
      await sisp.destroy();
    }

    const rotating = await sispWith(filename, 'new-key', ['old-key']);

    try {
      const result = await rotating.rotateEncryptionKey({ batch: 10 });

      expect(result.unreadableValues).toEqual([]);
      expect(result.unreadableValueCount).toBe(0);
    } finally {
      await rotating.destroy();
    }

    const after = await sispWith(filename, 'new-key');

    try {
      const [metadata] = await after.storage.requestMetadata.listByTransaction(transactionId);

      expect(metadata?.custom_metadata).toBe(CALLER_STRING);
    } finally {
      await after.destroy();
    }
  });
});
