export interface PaymentRequestData {
  readonly amount: number;
  readonly merchantRef?: string | null;
  readonly merchantSession?: string | null;
  readonly timeStamp?: string | null;
  readonly currency?: string | null;
  readonly transactionCode?: string | null;
  readonly token?: string | null;
  readonly entityCode?: string | null;
  readonly referenceNumber?: string | null;
  readonly locale?: string | null;
  readonly customerEmail?: string | null;
  readonly customerCountry?: string | null;
  readonly customerCity?: string | null;
  readonly customerAddress?: string | null;
  readonly customerPostalCode?: string | null;
  readonly customerPhone?: string | null;
}

const THREE_D_SECURE_FIELDS = [
  ['customerEmail', 'customer_email'],
  ['customerCountry', 'customer_country'],
  ['customerCity', 'customer_city'],
  ['customerAddress', 'customer_address'],
  ['customerPostalCode', 'customer_postal_code'],
] as const;

export function paymentRequestDataFrom(data: Record<string, unknown>): PaymentRequestData {
  return Object.freeze({
    amount: Number(data.amount),
    merchantRef: optionalText(data.merchantRef),
    merchantSession: optionalText(data.merchantSession),
    timeStamp: optionalText(data.timeStamp),
    currency: optionalText(data.currency),
    transactionCode: optionalText(data.transactionCode),
    token: optionalText(data.token),
    entityCode: optionalText(data.entityCode),
    referenceNumber: optionalText(data.referenceNumber),
    locale: optionalText(data.locale),
    customerEmail: optionalText(data.customer_email),
    customerCountry: optionalText(data.customer_country),
    customerCity: optionalText(data.customer_city),
    customerAddress: optionalText(data.customer_address),
    customerPostalCode: optionalText(data.customer_postal_code),
    customerPhone: optionalText(data.customer_phone),
  });
}

export function missingThreeDSecureFields(data: PaymentRequestData): string[] {
  return THREE_D_SECURE_FIELDS.filter(([property]) => data[property] == null).map(
    ([, requestField]) => requestField,
  );
}

export function hasThreeDSecureData(data: PaymentRequestData): boolean {
  return missingThreeDSecureFields(data).length === 0;
}

function optionalText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return null;
}
