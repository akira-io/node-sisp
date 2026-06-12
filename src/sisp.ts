import type { Knex } from 'knex';
import type { BuildRequestPayloadAction } from './actions/build-request-payload';
import type { ResolvedSispConfig } from './config';
import type { CredentialsResolver } from './contracts/credentials-resolver';
import type { SispDriver } from './contracts/sisp-driver';
import type { TransactionRecord } from './database/records';
import type { BlacklistRepository } from './database/models/blacklist-repository';
import type { InvoiceRepository } from './database/models/invoice-repository';
import type { TransactionItemRepository } from './database/models/transaction-item-repository';
import type { TransactionLogRepository } from './database/models/transaction-log-repository';
import type { TransactionRepository } from './database/models/transaction-repository';
import type { SispManager } from './drivers/sisp-manager';
import type { SispEventEmitter, SispEventMap, SispEventName } from './events';
import { validateCallbackFingerprint } from './fingerprints/callback-fingerprint';
import { computeToken } from './fingerprints/token';
import type { SispHttpHandlers } from './http/handlers';
import { CallbackContext } from './pipelines/callback/callback-context';
import type { HandleCallbackPipeline } from './pipelines/callback/handle-callback-pipeline';
import type { BuildSandboxPayloadAction, SandboxStatus } from './sandbox';
import { PaymentBuilder } from './builders/payment-builder';
import type { CallbackPayload } from './value-objects/callback-payload';
import type { PaymentRequest } from './value-objects/payment-request';
import type { PaymentRequestData } from './value-objects/payment-request-data';

export interface SispRepositories {
  transactions: TransactionRepository;
  transactionItems: TransactionItemRepository;
  invoices: InvoiceRepository;
  transactionLogs: TransactionLogRepository;
  blacklist: BlacklistRepository;
}

export class Sisp {
  constructor(
    readonly config: ResolvedSispConfig,
    readonly db: Knex,
    readonly events: SispEventEmitter,
    readonly manager: SispManager,
    readonly repositories: SispRepositories,
    readonly handlers: SispHttpHandlers,
    private readonly credentialsResolver: CredentialsResolver,
    private readonly buildRequestPayloadAction: BuildRequestPayloadAction,
    private readonly buildSandboxPayloadAction: BuildSandboxPayloadAction,
    private readonly callbackPipeline: HandleCallbackPipeline,
  ) {}

  payment(): PaymentBuilder {
    return new PaymentBuilder(this.buildRequestPayloadAction);
  }

  driver(name?: string | null): SispDriver {
    return this.manager.driver(name);
  }

  on<K extends SispEventName>(eventName: K, listener: (event: SispEventMap[K]) => unknown): this {
    this.events.on(eventName, listener);

    return this;
  }

  off<K extends SispEventName>(eventName: K, listener: (event: SispEventMap[K]) => unknown): this {
    this.events.off(eventName, listener);

    return this;
  }

  buildRequestPayload(data: PaymentRequestData): PaymentRequest {
    return this.buildRequestPayloadAction.handle(data);
  }

  validateCallback(payload: CallbackPayload): boolean {
    const token = computeToken(this.credentialsResolver.resolve().posAutCode);

    return validateCallbackFingerprint(token, payload);
  }

  async handlePaymentCallback(payload: CallbackPayload): Promise<TransactionRecord> {
    const context = await this.callbackPipeline.run(new CallbackContext(payload));

    return context.requireTransaction();
  }

  generateSandboxPayload(data: PaymentRequestData, status: SandboxStatus = 'success'): CallbackPayload {
    return this.buildSandboxPayloadAction.handle(data, status);
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }
}
