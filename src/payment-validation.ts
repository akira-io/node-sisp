export interface PaymentValidationConfig {
  maxAmount: number;
  allowedCurrencies: string[];
  allowClientMerchantIdentifiers: boolean;
  allowClientTimestamp: boolean;
  allowClientTransactionCode: boolean;
}

export const DEFAULT_MAX_PAYMENT_AMOUNT = 10_000_000;

export function resolvePaymentValidation(
  overrides: Partial<PaymentValidationConfig> | undefined,
  defaultCurrency: string,
): PaymentValidationConfig {
  return {
    maxAmount: positiveNumber(overrides?.maxAmount, DEFAULT_MAX_PAYMENT_AMOUNT),
    allowedCurrencies: overrides?.allowedCurrencies?.filter(
      (currency) => currency.trim() !== '',
    ) ?? [defaultCurrency],
    allowClientMerchantIdentifiers: overrides?.allowClientMerchantIdentifiers ?? false,
    allowClientTimestamp: overrides?.allowClientTimestamp ?? false,
    allowClientTransactionCode: overrides?.allowClientTransactionCode ?? false,
  };
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
