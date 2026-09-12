import type { StoredCallbackOutcome } from '../core/contracts/callback-verifier';
import { StaticCredentialsResolver } from '../core/contracts/credentials-resolver';
import type { SispStorage } from '../core/contracts/storage';
import type { CallbackPayload } from '../domain/value-objects/callback-payload';
import type { PaymentRequest } from '../domain/value-objects/payment-request';
import type { PaymentRequestData } from '../domain/value-objects/payment-request-data';
import type { SispCredentials } from '../domain/value-objects/sisp-credentials';
import type { TransactionStatusResponse } from '../domain/value-objects/transaction-status-response';
import { validateCallbackFingerprint } from '../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../infrastructure/fingerprints/token';
import type { TransactionRecord } from '../infrastructure/storage/knex/records';
import { PaymentBuilder } from './builders/payment-builder';
import type { ResolvedSispConfig } from './config';
import type { SispEventEmitter } from './events';
import type { SandboxErrorOverrides, SandboxStatus } from './sandbox';
import type { SispModels } from './sisp';
import { StatefulCallbackVerifier } from './verifiers/stateful-callback-verifier';
import { type CredentialScopedServices, wireCredentialScopedServices } from './wiring';

export class ScopedSisp {
  private readonly services: CredentialScopedServices;

  constructor(
    storage: SispStorage,
    config: ResolvedSispConfig,
    private readonly events: SispEventEmitter,
    models: SispModels,
    readonly credentials: SispCredentials,
  ) {
    this.services = wireCredentialScopedServices(
      storage,
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

  async handleCallback(payload: CallbackPayload): Promise<StoredCallbackOutcome> {
    return new StatefulCallbackVerifier(this.services.callbackPipeline, this.events).verify(
      payload,
    );
  }

  generateSandboxPayload(
    data: PaymentRequestData,
    status: SandboxStatus = 'success',
    errorOverrides: SandboxErrorOverrides = {},
  ): CallbackPayload {
    return this.services.buildSandboxPayload.handle(data, status, errorOverrides);
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
