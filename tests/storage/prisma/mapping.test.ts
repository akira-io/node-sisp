import { describe, expect, it } from 'vitest';
import { PayloadCipher } from '../../../src/infrastructure/storage/knex/encryption';
import {
  mapBlacklist,
  mapInvoice,
  mapPaymentIntent,
  mapRequestMetadata,
  mapTransaction,
  mapTransactionAttempt,
  mapTransactionItem,
  mapTransactionLog,
  newTransactionToData,
} from '../../../src/infrastructure/storage/prisma/mapping';

const cipher = new PayloadCipher('test-app-key-32-bytes-long-enough');
const nullCipher = new PayloadCipher(null);

const baseTimestamp = '2024-01-15T10:00:00.000Z';
const baseDate = new Date(baseTimestamp);

describe('mapTransaction', () => {
  it('hydrates amount via fromCents', () => {
    const row = {
      id: 1n,
      merchantRef: 'REF001',
      merchantSession: 'SES001',
      amountCents: 1000n,
      currency: '132',
      status: 'pending',
      transactionCode: '1',
      transactionId: null,
      messageType: null,
      responseCode: null,
      merchantResponse: null,
      fingerprint: null,
      payload: null,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      customerCountry: null,
      customerCity: null,
      customerAddress: null,
      customerPostalCode: null,
      locale: 'pt',
      cancelledAt: null,
      refundedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapTransaction(row, nullCipher);

    expect(record.amount).toBe(10);
    expect(record.amount_cents).toBe(1000);
    expect(record.id).toBe(1);
    expect(record.merchant_ref).toBe('REF001');
    expect(record.created_at).toBe(baseTimestamp);
  });

  it('decrypts payload using cipher', () => {
    const payload = { key: 'value' };
    const stored = cipher.store(payload);

    const row = {
      id: 2n,
      merchantRef: 'REF002',
      merchantSession: 'SES002',
      amountCents: 500n,
      currency: '132',
      status: 'completed',
      transactionCode: '1',
      transactionId: 'TXN123',
      messageType: '8',
      responseCode: '00',
      merchantResponse: 'OK',
      fingerprint: 'fp',
      payload: stored,
      customerName: 'John',
      customerEmail: 'john@example.com',
      customerPhone: null,
      customerCountry: 'CV',
      customerCity: 'Praia',
      customerAddress: null,
      customerPostalCode: null,
      locale: 'en',
      cancelledAt: null,
      refundedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapTransaction(row, cipher);

    expect(record.payload).toEqual(payload);
    expect(record.status).toBe('completed');
  });
});

describe('newTransactionToData', () => {
  it('serializes amount as amountCents bigint', () => {
    const data = {
      merchantRef: 'REF001',
      merchantSession: 'SES001',
      amount: 10,
      currency: '132',
    };

    const result = newTransactionToData(data, nullCipher, baseTimestamp);

    expect(result.amountCents).toBe(1000n);
    expect(result.status).toBe('pending');
    expect(result.locale).toBe('pt');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('encrypts payload using cipher', () => {
    const payload = { test: true };
    const data = {
      merchantRef: 'REF001',
      merchantSession: 'SES001',
      amount: 5,
      payload,
    };

    const result = newTransactionToData(data, cipher, baseTimestamp);

    expect(typeof result.payload).toBe('string');
    expect(result.payload as string).toMatch(/^sisp\.v1:/);
  });
});

describe('mapTransactionItem', () => {
  it('maps all fields correctly', () => {
    const row = {
      id: 1n,
      transactionId: 42n,
      productId: 'PROD001',
      productName: 'Widget',
      quantity: 2,
      unitPriceCents: 500n,
      totalPriceCents: 1000n,
      description: 'A widget',
      metadata: '{"color":"red"}',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapTransactionItem(row);

    expect(record.id).toBe(1);
    expect(record.transaction_id).toBe(42);
    expect(record.product_id).toBe('PROD001');
    expect(record.product_name).toBe('Widget');
    expect(record.quantity).toBe(2);
    expect(record.unit_price_cents).toBe(500);
    expect(record.total_price_cents).toBe(1000);
    expect(record.metadata).toEqual({ color: 'red' });
    expect(record.created_at).toBe(baseTimestamp);
  });
});

describe('mapTransactionAttempt', () => {
  it('maps all fields and decrypts payloads', () => {
    const payload = { attempt: 1 };
    const callbackPayload = { cb: true };

    const row = {
      id: 1n,
      transactionId: 5n,
      attemptNumber: 1,
      merchantRef: 'REF001',
      merchantSession: 'SES001',
      status: 'pending',
      gatewayTransactionId: null,
      messageType: null,
      responseCode: null,
      merchantResponse: null,
      fingerprint: null,
      payload: cipher.store(payload),
      callbackPayload: cipher.store(callbackPayload),
      failureReason: null,
      submittedAt: baseDate,
      callbackReceivedAt: null,
      supersededAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapTransactionAttempt(row, cipher);

    expect(record.id).toBe(1);
    expect(record.transaction_id).toBe(5);
    expect(record.attempt_number).toBe(1);
    expect(record.payload).toEqual(payload);
    expect(record.callback_payload).toEqual(callbackPayload);
  });
});

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

describe('mapRequestMetadata', () => {
  it('coerces boolean fields', () => {
    const row = {
      id: 1n,
      transactionId: null,
      ipAddress: '10.0.0.1',
      userAgent: null,
      referer: null,
      countryCode: null,
      countryName: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      isp: null,
      deviceType: null,
      browser: null,
      os: null,
      deviceFingerprint: null,
      responseTimeMs: null,
      apiVersion: null,
      isVpn: 0,
      isProxy: 1,
      isMobile: 0,
      riskScore: 25,
      riskReason: null,
      customMetadata: '{"source":"api"}',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapRequestMetadata(row);

    expect(record.is_vpn).toBe(false);
    expect(record.is_proxy).toBe(true);
    expect(record.is_mobile).toBe(false);
    expect(record.risk_score).toBe(25);
    expect(record.custom_metadata).toEqual({ source: 'api' });
  });
});
