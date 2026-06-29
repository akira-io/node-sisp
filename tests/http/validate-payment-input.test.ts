import { describe, expect, it } from 'vitest';
import { resolvePaymentValidation } from '../../src/domain/policies/payment-validation';
import { formatAmountEcv } from '../../src/infrastructure/http/payment-response';
import {
  DEFAULT_MAX_PAYMENT_AMOUNT,
  validatePaymentInput,
} from '../../src/infrastructure/http/validate-payment-input';

const validBody = {
  amount: 1500,
  items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1500 }],
};

describe('validatePaymentInput', () => {
  it('accepts a consistent payment body', () => {
    expect(validatePaymentInput(validBody).valid).toBe(true);
  });

  it('requires amount and items', () => {
    const result = validatePaymentInput({});

    expect(result.valid).toBe(false);
    expect(result.errors.amount).toEqual(['The amount field is required.']);
    expect(result.errors.items).toEqual(['The items field is required.']);
  });

  it('requires a positive amount', () => {
    expect(validatePaymentInput({ ...validBody, amount: 0 }).errors.amount).toEqual([
      'The amount must be at least 0.01.',
    ]);
  });

  it.each(['1e12', ' 10 ', '8.001', 'abc'])('requires strict decimal amount %s', (amount) => {
    expect(validatePaymentInput({ ...validBody, amount }).errors.amount).toEqual([
      'The amount must be a decimal number.',
    ]);
  });

  it('enforces a configurable maximum amount', () => {
    const result = validatePaymentInput(
      {
        amount: 1001,
        items: [{ product_name: 'Plano Pro', quantity: 1, unit_price: 1001, total_price: 1001 }],
      },
      resolvePaymentValidation({ maxAmount: 1000 }, '132'),
    );

    expect(result.errors.amount).toEqual(['The amount may not be greater than 1000.']);
  });

  it('uses a safe default maximum amount', () => {
    expect(DEFAULT_MAX_PAYMENT_AMOUNT).toBe(10_000_000);
  });

  it('rejects line totals that do not match quantity times unit price', () => {
    const result = validatePaymentInput({
      amount: 1500,
      items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1400 }],
    });

    expect(result.errors['items.0.total_price']).toEqual([
      'Item total must equal quantity multiplied by unit price.',
    ]);
  });

  it('rejects amounts that do not match the sum of item totals', () => {
    const result = validatePaymentInput({
      amount: 2000,
      items: [{ product_name: 'Plano Pro', quantity: 2, unit_price: 750, total_price: 1500 }],
    });

    expect(result.errors.amount).toEqual(['Payment amount must equal the sum of item totals.']);
  });

  it('compares totals in minor units to avoid float drift', () => {
    const result = validatePaymentInput({
      amount: 0.3,
      items: [
        { product_name: 'A', quantity: 1, unit_price: 0.1, total_price: 0.1 },
        { product_name: 'B', quantity: 1, unit_price: 0.2, total_price: 0.2 },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it('allows only configured currencies when supplied', () => {
    const result = validatePaymentInput({ ...validBody, currency: '978' });

    expect(result.errors.currency).toEqual(['The currency is not allowed.']);
    expect(
      validatePaymentInput(
        { ...validBody, currency: '978' },
        resolvePaymentValidation({ allowedCurrencies: ['132', '978'] }, '132'),
      ).valid,
    ).toBe(true);
  });

  it.each([
    'merchantRef',
    'merchantSession',
    'timeStamp',
    'transactionCode',
  ])('rejects public %s overrides', (field) => {
    const result = validatePaymentInput({ ...validBody, [field]: 'client-value' });

    expect(result.errors[field]).toEqual([
      `The ${field} field cannot be supplied by payment requests.`,
    ]);
  });

  it('can opt in to server-controlled request field overrides', () => {
    const result = validatePaymentInput(
      {
        ...validBody,
        merchantRef: 'R1',
        merchantSession: 'S1',
        timeStamp: '2026-06-12 10:00:00',
        transactionCode: '4',
      },
      resolvePaymentValidation(
        {
          allowClientMerchantIdentifiers: true,
          allowClientTimestamp: true,
          allowClientTransactionCode: true,
        },
        '132',
      ),
    );

    expect(result.valid).toBe(true);
  });

  it('rejects half-cent item values before total comparison', () => {
    const result = validatePaymentInput({
      amount: '1.00',
      items: [{ product_name: 'A', quantity: 1, unit_price: '1.005', total_price: '1.005' }],
    });

    expect(result.errors['items.0.unit_price']).toEqual([
      'The unit price must be a number of at least 0.',
    ]);
    expect(result.errors['items.0.total_price']).toEqual([
      'The total price must be a number of at least 0.',
    ]);
  });

  it.each([
    ['kid@akira.cv', true],
    ['a@b.co', true],
    ['no-at-sign', false],
    ['two@@signs.cv', false],
    ['spaces in@mail.cv', false],
    ['@missing-local.cv', false],
    ['missing-domain@', false],
    ['no-dot@domain', false],
    ['dot-at-end@domain.', false],
    ['!@!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!.!', true],
  ] as const)('validates email %s in linear time', (email, valid) => {
    const result = validatePaymentInput({ ...validBody, customer_email: email });

    expect(result.errors.customer_email === undefined).toBe(valid);
  });

  it('validates item fields and customer email', () => {
    const result = validatePaymentInput({
      amount: 100,
      items: [{ quantity: 0, unit_price: -1 }],
      customer_email: 'not-an-email',
    });

    expect(result.errors['items.0.product_name']).toBeDefined();
    expect(result.errors['items.0.quantity']).toBeDefined();
    expect(result.errors['items.0.unit_price']).toBeDefined();
    expect(result.errors.customer_email).toBeDefined();
  });
});

describe('formatAmountEcv', () => {
  it.each([
    [1500, '1.500 ECV'],
    [1500.4, '1.500 ECV'],
    [1234567, '1.234.567 ECV'],
    [5, '5 ECV'],
  ])('formats %s as %s', (amount, expected) => {
    expect(formatAmountEcv(amount)).toBe(expected);
  });
});
