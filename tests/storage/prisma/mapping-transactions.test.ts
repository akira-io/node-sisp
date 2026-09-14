import { describe, expect, it } from 'vitest';
import { PayloadCipher } from '../../../src/infrastructure/storage/knex/encryption';
import {
  mapTransaction,
  mapTransactionAttempt,
  mapTransactionItem,
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
    expect(result.payload as string).toMatch(/^sisp\.v2:/);
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
