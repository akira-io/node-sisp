import { describe, expect, it } from 'vitest';
import { formatAmountEcv } from '../../src/http/payment-response';
import { validatePaymentInput } from '../../src/http/validate-payment-input';

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
