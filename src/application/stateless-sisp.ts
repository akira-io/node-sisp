import type { CallbackOutcome, CallbackVerifier } from '../core/contracts/callback-verifier';
import type { CredentialsResolver } from '../core/contracts/credentials-resolver';
import type { ExpectedPayment } from '../core/contracts/payment-correlation-store';
import type { SispDriver } from '../core/contracts/sisp-driver';
import type { CallbackPayload } from '../domain/value-objects/callback-payload';
import type { PaymentRequest } from '../domain/value-objects/payment-request';
import type { PaymentRequestData } from '../domain/value-objects/payment-request-data';
import type { TransactionStatusResponse } from '../domain/value-objects/transaction-status-response';
import type { SispManager } from '../infrastructure/drivers/sisp-manager';
import { validateCallbackFingerprint } from '../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../infrastructure/fingerprints/token';
import type { StatelessHttpHandlers } from '../infrastructure/http/stateless-handlers';
import type { BuildRequestPayloadAction } from './actions/build-request-payload';
import { PaymentBuilder } from './builders/payment-builder';
import type { ResolvedSharedConfig } from './config';
import type { SispEventEmitter, SispEventMap, SispEventName } from './events';
import type { BuildSandboxPayloadAction, SandboxErrorOverrides, SandboxStatus } from './sandbox';

export class StatelessSisp {
  constructor(
    readonly config: ResolvedSharedConfig,
    readonly events: SispEventEmitter,
    readonly manager: SispManager,
    readonly handlers: StatelessHttpHandlers,
    protected readonly credentialsResolver: CredentialsResolver,
    protected readonly buildRequestPayloadAction: BuildRequestPayloadAction,
    protected readonly buildSandboxPayloadAction: BuildSandboxPayloadAction,
    protected readonly callbackVerifier: CallbackVerifier,
    readonly correlationConfigured: boolean = false,
  ) {}

  payment(): PaymentBuilder {
    return new PaymentBuilder(this.buildRequestPayloadAction);
  }

  buildRequestPayload(data: PaymentRequestData): PaymentRequest {
    return this.buildRequestPayloadAction.handle(data);
  }

  validateCallback(payload: CallbackPayload): boolean {
    return validateCallbackFingerprint(
      computeToken(this.credentialsResolver.resolve().posAutCode),
      payload,
    );
  }

  async handleCallback(
    payload: CallbackPayload,
    expected?: ExpectedPayment,
  ): Promise<CallbackOutcome> {
    return this.callbackVerifier.verify(payload, expected);
  }

  generateSandboxPayload(
    data: PaymentRequestData,
    status: SandboxStatus = 'success',
    errorOverrides: SandboxErrorOverrides = {},
  ): CallbackPayload {
    return this.buildSandboxPayloadAction.handle(data, status, errorOverrides);
  }

  async queryTransactionStatus(merchantRef: string): Promise<TransactionStatusResponse> {
    return this.manager.driver().queryTransactionStatus(merchantRef);
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

  async destroy(): Promise<void> {}
}
