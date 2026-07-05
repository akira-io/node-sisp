export interface CustomerData {
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly postalCode: string | null;
}

export function customerDataFrom(data: Record<string, unknown>): CustomerData {
  return Object.freeze({
    name: optionalText(data.customer_name),
    email: optionalText(data.customer_email),
    phone: optionalText(data.customer_phone),
    country: optionalText(data.customer_country),
    city: optionalText(data.customer_city),
    address: optionalText(data.customer_address),
    postalCode: optionalText(data.customer_postal_code),
  });
}

export function customerDataToRecord(customer: CustomerData): Record<string, string | null> {
  return {
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    customer_country: customer.country,
    customer_city: customer.city,
    customer_address: customer.address,
    customer_postal_code: customer.postalCode,
  };
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
