import { type ResolvedSispConfig, routeUrl } from '../config';
import type { CredentialsResolver } from '../contracts/credentials-resolver';
import { MissingThreeDSecureDataError } from '../exceptions';
import { generatePaymentFingerprint } from '../fingerprints/payment-fingerprint';
import { computeToken } from '../fingerprints/token';
import type { PaymentRequest } from '../value-objects/payment-request';
import {
  hasThreeDSecureData,
  missingThreeDSecureFields,
  type PaymentRequestData,
} from '../value-objects/payment-request-data';
import { buildPurchaseRequest } from './build-purchase-request';

export class BuildRequestPayloadAction {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly credentialsResolver: CredentialsResolver,
  ) {}

  handle(data: PaymentRequestData): PaymentRequest {
    const credentials = this.credentialsResolver.resolve();

    const request: Omit<PaymentRequest, 'fingerprint'> = {
      posID: credentials.posId,
      merchantRef: data.merchantRef ?? this.config.generators.merchantReference(),
      merchantSession: data.merchantSession ?? this.config.generators.merchantSession(),
      amount: data.amount,
      currency: data.currency ?? credentials.currency,
      is3DSec: credentials.is3DSec,
      urlMerchantResponse: credentials.urlMerchantResponse ?? routeUrl(this.config, 'callback'),
      languageMessages: credentials.languageMessages,
      timeStamp: data.timeStamp ?? this.config.generators.timeStamp(),
      fingerprintversion: credentials.fingerprintVersion,
      transactionCode: data.transactionCode ?? this.config.transactionCode,
      token: data.token ?? '',
      entityCode: data.entityCode ?? '',
      referenceNumber: data.referenceNumber ?? '',
      locale: data.locale ?? 'pt_PT',
      purchaseRequest: this.buildPurchaseRequestIfNeeded(data, credentials.is3DSec),
    };

    const fingerprint = generatePaymentFingerprint(computeToken(credentials.posAutCode), {
      amount: request.amount,
      timeStamp: request.timeStamp,
      merchantRef: request.merchantRef,
      merchantSession: request.merchantSession,
      posID: request.posID,
      currency: request.currency,
      transactionCode: request.transactionCode,
    });

    return { ...request, fingerprint };
  }

  private buildPurchaseRequestIfNeeded(data: PaymentRequestData, is3DSec: string): string {
    if (is3DSec !== '1') {
      return '';
    }

    if (!hasThreeDSecureData(data)) {
      throw new MissingThreeDSecureDataError(missingThreeDSecureFields(data));
    }

    return buildPurchaseRequest({
      email: data.customerEmail as string,
      country: data.customerCountry as string,
      city: data.customerCity as string,
      address: data.customerAddress as string,
      postalCode: data.customerPostalCode as string,
      phone: data.customerPhone,
    });
  }
}
