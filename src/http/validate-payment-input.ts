export interface PaymentValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePaymentInput(body: Record<string, unknown>): PaymentValidationResult {
  const errors: Record<string, string[]> = {};

  validateAmount(body.amount, errors);
  validateItems(body.items, errors);
  validateCustomerFields(body, errors);

  if (Object.keys(errors).length === 0) {
    validateTotals(body, errors);
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function validateAmount(amount: unknown, errors: Record<string, string[]>): void {
  if (amount === undefined || amount === null || amount === '') {
    addError(errors, 'amount', 'The amount field is required.');

    return;
  }

  const value = Number(amount);

  if (Number.isNaN(value)) {
    addError(errors, 'amount', 'The amount must be a number.');

    return;
  }

  if (value < 0.01) {
    addError(errors, 'amount', 'The amount must be at least 0.01.');
  }
}

function validateItems(items: unknown, errors: Record<string, string[]>): void {
  if (!Array.isArray(items) || items.length === 0) {
    addError(errors, 'items', 'The items field is required.');

    return;
  }

  items.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      addError(errors, `items.${index}`, 'Each item must be an object.');

      return;
    }

    validateItem(item as Record<string, unknown>, index, errors);
  });
}

function validateItem(
  item: Record<string, unknown>,
  index: number,
  errors: Record<string, string[]>,
): void {
  if (typeof item.product_name !== 'string' || item.product_name === '') {
    addError(errors, `items.${index}.product_name`, 'The product name is required.');
  }

  const quantity = Number(item.quantity);

  if (!Number.isInteger(quantity) || quantity < 1) {
    addError(errors, `items.${index}.quantity`, 'The quantity must be an integer of at least 1.');
  }

  for (const field of ['unit_price', 'total_price'] as const) {
    const value = Number(item[field]);

    if (item[field] === undefined || Number.isNaN(value) || value < 0) {
      addError(
        errors,
        `items.${index}.${field}`,
        `The ${field.replace('_', ' ')} must be a number of at least 0.`,
      );
    }
  }
}

function validateCustomerFields(
  body: Record<string, unknown>,
  errors: Record<string, string[]>,
): void {
  const email = body.customer_email;

  if (email !== undefined && (typeof email !== 'string' || !EMAIL_PATTERN.test(email))) {
    addError(errors, 'customer_email', 'The customer email must be a valid email address.');
  }
}

function validateTotals(body: Record<string, unknown>, errors: Record<string, string[]>): void {
  const items = body.items as Array<Record<string, unknown>>;
  let submittedTotal = 0;

  items.forEach((item, index) => {
    const lineTotal = minorUnits(item.total_price);
    const expectedLineTotal = Math.trunc(Number(item.quantity ?? 0)) * minorUnits(item.unit_price);

    submittedTotal += lineTotal;

    if (lineTotal !== expectedLineTotal) {
      addError(
        errors,
        `items.${index}.total_price`,
        'Item total must equal quantity multiplied by unit price.',
      );
    }
  });

  if (minorUnits(body.amount) !== submittedTotal) {
    addError(errors, 'amount', 'Payment amount must equal the sum of item totals.');
  }
}

function minorUnits(amount: unknown): number {
  return Math.round(Number(amount ?? 0) * 100);
}

function addError(errors: Record<string, string[]>, field: string, message: string): void {
  errors[field] = [...(errors[field] ?? []), message];
}
