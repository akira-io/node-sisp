import type { PaymentRequest } from '../../domain/value-objects/payment-request';
import type { PaymentRequestData } from '../../domain/value-objects/payment-request-data';
import type { BuildRequestPayloadAction } from '../actions/build-request-payload';

export class PaymentBuilder {
  private readonly data: Partial<PaymentRequestData> = {};

  constructor(private readonly buildRequestPayload: BuildRequestPayloadAction) {}

  amount(amount: number): this {
    this.data.amount = amount;

    return this;
  }

  merchantRef(merchantRef: string): this {
    this.data.merchantRef = merchantRef;

    return this;
  }

  merchantSession(merchantSession: string): this {
    this.data.merchantSession = merchantSession;

    return this;
  }

  timeStamp(timeStamp: string): this {
    this.data.timeStamp = timeStamp;

    return this;
  }

  currency(currency: string): this {
    this.data.currency = currency;

    return this;
  }

  transactionCode(transactionCode: string): this {
    this.data.transactionCode = transactionCode;

    return this;
  }

  token(token: string): this {
    this.data.token = token;

    return this;
  }

  entityCode(entityCode: string): this {
    this.data.entityCode = entityCode;

    return this;
  }

  referenceNumber(referenceNumber: string): this {
    this.data.referenceNumber = referenceNumber;

    return this;
  }

  locale(locale: string): this {
    this.data.locale = locale;

    return this;
  }

  customerEmail(email: string): this {
    this.data.customerEmail = email;

    return this;
  }

  customerCountry(country: string): this {
    this.data.customerCountry = country;

    return this;
  }

  customerCity(city: string): this {
    this.data.customerCity = city;

    return this;
  }

  customerAddress(address: string): this {
    this.data.customerAddress = address;

    return this;
  }

  customerPostalCode(postalCode: string): this {
    this.data.customerPostalCode = postalCode;

    return this;
  }

  customerPhone(phone: string): this {
    this.data.customerPhone = phone;

    return this;
  }

  toData(): PaymentRequestData {
    if (this.data.amount === undefined || this.data.amount <= 0) {
      throw new Error('A payment amount greater than zero is required.');
    }

    return { ...this.data, amount: this.data.amount };
  }

  build(): PaymentRequest {
    return this.buildRequestPayload.handle(this.toData());
  }
}
