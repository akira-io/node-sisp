import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLES } from '../../../src/application/config';
import type { SispStorage } from '../../../src/core/contracts/storage';
import { InvoiceStatus } from '../../../src/domain/enums/invoice-status';
import type { TransactionRecord } from '../../../src/domain/records';
import { createDrizzleStorage } from '../../../src/infrastructure/storage/drizzle';

const dir = mkdtempSync(join(tmpdir(), 'sisp-drizzle-repositories-'));

let storage: SispStorage;

async function transaction(suffix: string): Promise<TransactionRecord> {
  return storage.transactions.create({
    merchantRef: `REF-${suffix}`,
    merchantSession: `SES-${suffix}`,
    amount: 1000,
  });
}

beforeEach(async () => {
  storage = createDrizzleStorage(
    drizzle(new Database(join(dir, `${process.hrtime.bigint()}.db`))),
    DEFAULT_TABLES,
    'app-key',
    { dialect: 'sqlite', autoMigrate: true },
  );

  await storage.migrate?.();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('blacklist', () => {
  it('finds an entry with no expiry and removes it', async () => {
    await storage.blacklist.add({ type: 'ip', value: '203.0.113.1', reason: 'fraud' });

    expect(await storage.blacklist.isBlacklisted('ip', '203.0.113.1')).toBe(true);
    expect((await storage.blacklist.find('ip', '203.0.113.1'))?.severity).toBe('medium');
    expect(await storage.blacklist.remove('ip', '203.0.113.1')).toBe(true);
    expect(await storage.blacklist.isBlacklisted('ip', '203.0.113.1')).toBe(false);
  });

  it('reports false for removing an entry that is not there', async () => {
    expect(await storage.blacklist.remove('ip', '198.51.100.9')).toBe(false);
  });

  it('ignores an entry whose expiry has passed', async () => {
    await storage.blacklist.add({ type: 'ip', value: '203.0.113.2', expiresInMinutes: -1 });

    expect(await storage.blacklist.isBlacklisted('ip', '203.0.113.2')).toBe(false);
  });

  it('keeps an entry whose expiry is still ahead', async () => {
    await storage.blacklist.add({ type: 'ip', value: '203.0.113.3', expiresInMinutes: 60 });

    expect(await storage.blacklist.isBlacklisted('ip', '203.0.113.3')).toBe(true);
  });
});

describe('invoices', () => {
  it('numbers an invoice from the transaction and dates it a week out', async () => {
    const created = await transaction('INVOICE');
    const invoice = await storage.invoices.createForTransaction(created);

    expect(invoice.invoice_number).toBe(
      `INV-${new Date(created.created_at as string).getFullYear()}${String(
        new Date(created.created_at as string).getMonth() + 1,
      ).padStart(2, '0')}-${String(created.id).padStart(6, '0')}`,
    );
    expect(invoice.status).toBe('pending');

    const due = Date.parse(invoice.due_date as string) - Date.parse(invoice.invoice_date);

    expect(due).toBe(7 * 86_400_000);
  });

  it('updates the status of an existing invoice', async () => {
    const created = await transaction('INVOICE-STATUS');

    await storage.invoices.createForTransaction(created);
    await storage.invoices.updateStatus(created.id, InvoiceStatus.Paid);

    expect((await storage.invoices.findByTransaction(created.id))?.status).toBe(InvoiceStatus.Paid);
  });

  it('returns null for a transaction with no invoice', async () => {
    expect(await storage.invoices.findByTransaction(999_999)).toBeNull();
  });
});

describe('paymentIntents.submit', () => {
  it('binds the intent to the transaction it produced', async () => {
    const created = await transaction('INTENT');

    await storage.paymentIntents.reserve('KEY-SUBMIT', 'hash');
    await storage.paymentIntents.submit('KEY-SUBMIT', created.id);

    const intent = await storage.paymentIntents.findByKey('KEY-SUBMIT');

    expect(intent?.status).toBe('submitted');
    expect(intent?.transaction_id).toBe(created.id);
  });
});

describe('transactionAttempts', () => {
  it('supersedes the open attempt and numbers the next one', async () => {
    const created = await transaction('ATTEMPT-SUPERSEDE');

    await storage.transactionAttempts.createFromTransaction(created);

    const attempts = await storage.transactionAttempts.listByTransaction(created.id);

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.attempt_number).toBe(1);
    expect(await storage.transactionAttempts.existsByTransaction(created.id)).toBe(true);
    expect((await storage.transactionAttempts.currentByTransaction(created.id))?.id).toBe(
      attempts[0]?.id,
    );
  });

  it('reports no attempt for a transaction that has none', async () => {
    const created = await transaction('ATTEMPT-NONE');

    expect(await storage.transactionAttempts.existsByTransaction(created.id)).toBe(false);
    expect(await storage.transactionAttempts.currentByTransaction(created.id)).toBeNull();
  });

  it('finds an attempt by ref and session', async () => {
    const created = await transaction('ATTEMPT-LOOKUP');

    await storage.transactionAttempts.createFromTransaction(created);

    const found = await storage.transactionAttempts.findByRefAndSession(
      created.merchant_ref,
      created.merchant_session,
    );

    expect(found?.transaction_id).toBe(created.id);
    expect(
      await storage.transactionAttempts.findByRefAndSessionForUpdate(
        created.merchant_ref,
        created.merchant_session,
      ),
    ).not.toBeNull();
  });

  it('encrypts a callback payload it is given and reads it back', async () => {
    const created = await transaction('ATTEMPT-CALLBACK');
    const attempt = await storage.transactionAttempts.createFromTransaction(created);

    const updated = await storage.transactionAttempts.update(attempt.id, {
      status: 'completed',
      callback_payload: { merchantRespCP: '000', nested: { ok: true } },
    });

    expect(updated.callback_payload).toEqual({ merchantRespCP: '000', nested: { ok: true } });
  });
});

describe('transactions lookups and list filters', () => {
  it('finds a transaction by ref, session and gateway id', async () => {
    const created = await transaction('LOOKUP');

    await storage.transactions.update(created.id, { transaction_id: 'GW-1' });

    expect((await storage.transactions.findByRef(created.merchant_ref))?.id).toBe(created.id);
    expect(
      (
        await storage.transactions.findByRefAndSession(
          created.merchant_ref,
          created.merchant_session,
        )
      )?.id,
    ).toBe(created.id);
    expect(
      (
        await storage.transactions.findByRefAndSessionForUpdate(
          created.merchant_ref,
          created.merchant_session,
        )
      )?.id,
    ).toBe(created.id);
    expect((await storage.transactions.findByGatewayTransactionId('GW-1'))?.id).toBe(created.id);
  });

  it('filters the list by status and honours the offset', async () => {
    const first = await transaction('LIST-A');

    await transaction('LIST-B');
    await storage.transactions.update(first.id, { status: 'completed' });

    const completed = await storage.transactions.list({ status: 'completed' });

    expect(completed.map((row) => row.merchant_ref)).toEqual(['REF-LIST-A']);
    expect(await storage.transactions.list({ offset: 2 })).toHaveLength(0);
  });

  it('lists only pending transactions older than the cutoff for reconciliation', async () => {
    const created = await transaction('RECONCILE');
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    expect(await storage.transactions.listPendingForReconciliation(future, 10)).toHaveLength(1);
    expect(await storage.transactions.listPendingForReconciliation(past, 10)).toHaveLength(0);

    await storage.transactions.update(created.id, { status: 'completed' });

    expect(await storage.transactions.listPendingForReconciliation(future, 10)).toHaveLength(0);
  });
});

describe('transactionItems.createMany', () => {
  it('writes nothing for an empty list', async () => {
    const created = await transaction('ITEMS-EMPTY');

    await storage.transactionItems.createMany(created.id, []);

    expect(await storage.transactionItems.listByTransaction(created.id)).toHaveLength(0);
  });
});

describe('transaction log retention', () => {
  it('keeps the newest hundred log rows and drops the older ones', async () => {
    const created = await transaction('PRUNE');

    for (let index = 0; index < 105; index += 1) {
      await storage.transactions.update(created.id, { merchant_response: `response-${index}` });
    }

    const logs = await storage.transactionLogs.listByTransaction(created.id, {
      limit: 100,
      order: 'desc',
    });

    expect(logs).toHaveLength(100);
    expect(logs[0]?.new_values).toMatchObject({ merchant_response: 'response-104' });

    const oldest = await storage.transactionLogs.listByTransaction(created.id, {
      limit: 1,
      order: 'asc',
    });

    expect(oldest[0]?.new_values).toMatchObject({ merchant_response: 'response-5' });
  });
});
