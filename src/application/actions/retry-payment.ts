import type { PaymentRequest } from '../../domain/value-objects/payment-request';
import type { PaymentRequestData } from '../../domain/value-objects/payment-request-data';
import type { TransactionRecord } from '../../infrastructure/database/records';
import type { BuildRequestPayloadAction } from './build-request-payload';

const FALLBACK_POSTAL_CODE = '0000';

export class RetryPaymentAction {
  constructor(private readonly buildRequestPayload: BuildRequestPayloadAction) {}

  handle(transaction: TransactionRecord, rotateMerchantSession = true): PaymentRequest {
    return this.buildRequestPayload.handle(this.extract(transaction, rotateMerchantSession));
  }

  private extract(
    transaction: TransactionRecord,
    rotateMerchantSession: boolean,
  ): PaymentRequestData {
    return {
      amount: transaction.amount,
      merchantRef: transaction.merchant_ref,
      merchantSession: rotateMerchantSession ? null : transaction.merchant_session,
      timeStamp: null,
      currency: transaction.currency,
      transactionCode: transaction.transaction_code,
      token: '',
      entityCode: '',
      referenceNumber: '',
      locale: transaction.locale,
      customerEmail: transaction.customer_email,
      customerCountry: transaction.customer_country,
      customerCity: transaction.customer_city,
      customerAddress: transaction.customer_address,
      customerPostalCode: transaction.customer_postal_code || FALLBACK_POSTAL_CODE,
      customerPhone: transaction.customer_phone,
    };
  }
}
