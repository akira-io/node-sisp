import { PaymentBuilder } from './builders/payment-builder';
import type { ResolvedSispConfig } from './config';
import { StaticCredentialsResolver } from './contracts/credentials-resolver';
import type { TransactionRecord } from './database/records';
import type { SispEventEmitter } from './events';
import { validateCallbackFingerprint } from './fingerprints/callback-fingerprint';
import { computeToken } from './fingerprints/token';
import { CallbackContext } from './pipelines/callback/callback-context';
import type { SandboxStatus } from './sandbox';
import type { SispModels } from './sisp';
import type { CallbackPayload } from './value-objects/callback-payload';
import type { PaymentRequest } from './value-objects/payment-request';
import type { PaymentRequestData } from './value-objects/payment-request-data';
import type { SispCredentials } from './value-objects/sisp-credentials';
import type { TransactionStatusResponse } from './value-objects/transaction-status-response';
import { type CredentialScopedServices, wireCredentialScopedServices } from './wiring';

export class ScopedSisp {
  private readonly services: CredentialScopedServices;

  constructor(
    config: ResolvedSispConfig,
    events: SispEventEmitter,
    models: SispModels,
    readonly credentials: SispCredentials,
  ) {
    this.services = wireCredentialScopedServices(
      config,
      events,
      models,
      new StaticCredentialsResolver(credentials),
    );
  }

  payment(): PaymentBuilder {
    return new PaymentBuilder(this.services.buildRequestPayload);
  }

  buildRequestPayload(data: PaymentRequestData): PaymentRequest {
    return this.services.buildRequestPayload.handle(data);
  }

  validateCallback(payload: CallbackPayload): boolean {
    return validateCallbackFingerprint(computeToken(this.credentials.posAutCode), payload);
  }

  async handlePaymentCallback(payload: CallbackPayload): Promise<TransactionRecord> {
    const context = await this.services.callbackPipeline.run(new CallbackContext(payload));

    return context.requireTransaction();
  }

  generateSandboxPayload(
    data: PaymentRequestData,
    status: SandboxStatus = 'success',
  ): CallbackPayload {
    return this.services.buildSandboxPayload.handle(data, status);
  }

  async queryTransactionStatus(
    transaction: TransactionRecord | string,
  ): Promise<TransactionStatusResponse> {
    const merchantRef = typeof transaction === 'string' ? transaction : transaction.merchant_ref;

    return this.services.manager.driver().queryTransactionStatus(merchantRef);
  }

  async reconcileTransactionStatus(transaction: TransactionRecord): Promise<TransactionRecord> {
    return this.services.reconcileTransaction.handle(transaction);
  }
}
