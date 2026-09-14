import { describe, expect, it } from 'vitest';
import {
  mapBlacklist,
  mapInvoice,
  mapPaymentIntent,
  mapTransactionLog,
} from '../../../src/infrastructure/storage/prisma/mapping';

const baseTimestamp = '2024-01-15T10:00:00.000Z';
const baseDate = new Date(baseTimestamp);

describe('mapPaymentIntent', () => {
  it('maps fields correctly with nullable transaction_id', () => {
    const row = {
      id: 1n,
      idempotencyKey: 'key-123',
      transactionId: null,
      status: 'processing',
      failureReason: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapPaymentIntent(row);

    expect(record.id).toBe(1);
    expect(record.idempotency_key).toBe('key-123');
    expect(record.transaction_id).toBeNull();
    expect(record.status).toBe('processing');
  });

  it('converts transactionId bigint to number', () => {
    const row = {
      id: 2n,
      idempotencyKey: 'key-456',
      transactionId: 99n,
      status: 'submitted',
      failureReason: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapPaymentIntent(row);

    expect(record.transaction_id).toBe(99);
  });
});

describe('mapInvoice', () => {
  it('formats invoice_date as date-only string', () => {
    const row = {
      id: 1n,
      transactionId: 10n,
      invoiceNumber: 'INV-202401-000001',
      invoiceDate: new Date('2024-01-15'),
      dueDate: new Date('2024-01-22'),
      status: 'pending',
      customerName: 'Alice',
      customerEmail: 'alice@example.com',
      customerCity: null,
      customerAddress: null,
      customerCountry: null,
      notes: null,
      pdfPath: null,
      metadata: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapInvoice(row);

    expect(record.invoice_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.invoice_number).toBe('INV-202401-000001');
    expect(record.status).toBe('pending');
  });
});

describe('mapTransactionLog', () => {
  it('parses JSON columns', () => {
    const row = {
      id: 1n,
      transactionId: 3n,
      source: 'model',
      changedAttributes: '["status","amount"]',
      oldValues: '{"status":"pending"}',
      newValues: '{"status":"completed"}',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapTransactionLog(row);

    expect(record.changed_attributes).toEqual(['status', 'amount']);
    expect(record.old_values).toEqual({ status: 'pending' });
    expect(record.new_values).toEqual({ status: 'completed' });
  });

  it('handles pre-parsed JSON objects', () => {
    const row = {
      id: 2n,
      transactionId: 4n,
      source: 'api',
      changedAttributes: ['status'],
      oldValues: { status: 'pending' },
      newValues: { status: 'completed' },
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapTransactionLog(row);

    expect(record.changed_attributes).toEqual(['status']);
    expect(record.old_values).toEqual({ status: 'pending' });
  });
});

describe('mapBlacklist', () => {
  it('maps all fields correctly', () => {
    const row = {
      id: 1n,
      type: 'ip',
      value: '192.168.1.1',
      reason: 'Suspicious activity',
      severity: 'high',
      notes: null,
      addedBy: 'admin',
      expiresAt: baseDate,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapBlacklist(row);

    expect(record.id).toBe(1);
    expect(record.type).toBe('ip');
    expect(record.value).toBe('192.168.1.1');
    expect(record.severity).toBe('high');
    expect(record.added_by).toBe('admin');
  });
});
