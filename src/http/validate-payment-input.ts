import {
  DEFAULT_MAX_PAYMENT_AMOUNT,
  type PaymentValidationConfig,
  resolvePaymentValidation,
} from '../payment-validation';
import { toCents } from '../support/sisp-amount';

export interface PaymentValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
}

const DEFAULT_PAYMENT_VALIDATION = resolvePaymentValidation(undefined, '132');
const DECIMAL_AMOUNT_PATTERN = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const WHITESPACE_PATTERN = /\s/;

export function validatePaymentInput(
  body: Record<string, unknown>,
  options: PaymentValidationConfig = DEFAULT_PAYMENT_VALIDATION,
): PaymentValidationResult {
  const errors: Record<string, string[]> = {};

  validateAmount(body.amount, errors, options);
  validateCurrency(body.currency, errors, options);
  validateClientControlledFields(body, errors, options);
  validateItems(body.items, errors);
  validateCustomerFields(body, errors);

  if (Object.keys(errors).length === 0) {
    validateTotals(body, errors);
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function validateAmount(
  amount: unknown,
  errors: Record<string, string[]>,
  options: PaymentValidationConfig,
): void {
  if (amount === undefined || amount === null || amount === '') {
    addError(errors, 'amount', 'The amount field is required.');

    return;
  }

  const value = parseDecimalAmount(amount);

  if (value === null) {
    addError(errors, 'amount', 'The amount must be a decimal number.');

    return;
  }

  if (value < 0.01) {
    addError(errors, 'amount', 'The amount must be at least 0.01.');
  }

  if (value > options.maxAmount) {
    addError(errors, 'amount', `The amount may not be greater than ${options.maxAmount}.`);
  }
}

function validateCurrency(
  currency: unknown,
  errors: Record<string, string[]>,
  options: PaymentValidationConfig,
): void {
  if (currency === undefined || currency === null || currency === '') {
    return;
  }

  if (typeof currency !== 'string' || !options.allowedCurrencies.includes(currency)) {
    addError(errors, 'currency', 'The currency is not allowed.');
  }
}

function validateClientControlledFields(
  body: Record<string, unknown>,
  errors: Record<string, string[]>,
  options: PaymentValidationConfig,
): void {
  if (!options.allowClientMerchantIdentifiers) {
    rejectSuppliedField(body, errors, 'merchantRef');
    rejectSuppliedField(body, errors, 'merchantSession');
  }

  if (!options.allowClientTimestamp) {
    rejectSuppliedField(body, errors, 'timeStamp');
  }

  if (!options.allowClientTransactionCode) {
    rejectSuppliedField(body, errors, 'transactionCode');
  }
}

function rejectSuppliedField(
  body: Record<string, unknown>,
  errors: Record<string, string[]>,
  field: string,
): void {
  if (field in body) {
    addError(errors, field, `The ${field} field cannot be supplied by payment requests.`);
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
    const value = parseDecimalAmount(item[field]);

    if (item[field] === undefined || value === null || value < 0) {
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

  if (email !== undefined && (typeof email !== 'string' || !isValidEmail(email))) {
    addError(errors, 'customer_email', 'The customer email must be a valid email address.');
  }
}

function isValidEmail(email: string): boolean {
  if (WHITESPACE_PATTERN.test(email)) {
    return false;
  }

  const atIndex = email.indexOf('@');

  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) {
    return false;
  }

  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf('.');

  return dotIndex > 0 && dotIndex < domain.length - 1;
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
  const parsed = parseDecimalAmount(amount);

  return parsed === null ? 0 : toCents(parsed);
}

function addError(errors: Record<string, string[]>, field: string, message: string): void {
  errors[field] = [...(errors[field] ?? []), message];
}

function parseDecimalAmount(amount: unknown): number | null {
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : null;
  }

  if (typeof amount !== 'string' || !DECIMAL_AMOUNT_PATTERN.test(amount)) {
    return null;
  }

  return Number(amount);
}

export { DEFAULT_MAX_PAYMENT_AMOUNT };
