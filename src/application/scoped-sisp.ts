import type { Knex } from 'knex';
import { StaticCredentialsResolver } from '../core/contracts/credentials-resolver';
import type { CallbackPayload } from '../domain/value-objects/callback-payload';
import type { PaymentRequest } from '../domain/value-objects/payment-request';
import type { PaymentRequestData } from '../domain/value-objects/payment-request-data';
import type { SispCredentials } from '../domain/value-objects/sisp-credentials';
import type { TransactionStatusResponse } from '../domain/value-objects/transaction-status-response';
import type { TransactionRecord } from '../infrastructure/database/records';
import { validateCallbackFingerprint } from '../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../infrastructure/fingerprints/token';
import { PaymentBuilder } from './builders/payment-builder';
import type { ResolvedSispConfig } from './config';
import type { SispEventEmitter } from './events';
import { CallbackContext } from './pipelines/callback/callback-context';
import type { SandboxStatus } from './sandbox';
import type { SispModels } from './sisp';
import { type CredentialScopedServices, wireCredentialScopedServices } from './wiring';

export class ScopedSisp {
  private readonly services: CredentialScopedServices;

  constructor(
    db: Knex,
    config: ResolvedSispConfig,
    events: SispEventEmitter,
    models: SispModels,
    readonly credentials: SispCredentials,
  ) {
    this.services = wireCredentialScopedServices(
      db,
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
