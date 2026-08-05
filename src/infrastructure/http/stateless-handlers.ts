import type { BuildRequestPayloadAction } from '../../application/actions/build-request-payload';
import type { SispEventEmitter } from '../../application/events';
import type { BuildSandboxPayloadAction } from '../../application/sandbox';
import type { ResolvedStatelessConfig } from '../../application/stateless-config';
import type { CallbackOutcome, CallbackVerifier } from '../../core/contracts/callback-verifier';
import { CallbackRejectionReasons } from '../../domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../../domain/enums/transaction-status';
import { CorrelationRequiredError } from '../../domain/errors/exceptions';
import { callbackPayloadFrom } from '../../domain/value-objects/callback-payload';
import {
  type PaymentRequest,
  paymentRequestToFormFields,
} from '../../domain/value-objects/payment-request';
import { paymentRequestDataFrom } from '../../domain/value-objects/payment-request-data';
import type { UrlSigner } from '../../support/signed-url';
import type { SispManager } from '../drivers/sisp-manager';
import { renderAutoSubmitForm } from './auto-submit-form';
import { booleanFromInput, cancellationPayloadFrom } from './callback-processing';
import { buildGatewayFormAction } from './gateway-form-action';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json, redirect } from './results';
import { SandboxHandlers } from './sandbox-handlers';
import {
  readStatelessResult,
  signStatelessResult,
  statelessResultData,
} from './stateless-result-url';
import { validatePaymentInput } from './validate-payment-input';

export interface StatelessHttpHandlers {
  handlePayment(request: HttpRequestInfo): Promise<HttpResult>;
  handlePaymentIntent(request: HttpRequestInfo): Promise<HttpResult>;
  handleCallback(request: HttpRequestInfo): Promise<HttpResult>;
  handleSandbox(request: HttpRequestInfo): Promise<HttpResult>;
  handleCountries(): HttpResult;
}

export interface StatelessHandlersDeps {
  config: ResolvedStatelessConfig;
  manager: SispManager;
  buildRequestPayload: BuildRequestPayloadAction;
  buildSandboxPayload: BuildSandboxPayloadAction;
  callbackVerifier: CallbackVerifier;
  urlSigner: UrlSigner;
  events: SispEventEmitter;
}

export class StatelessSispHttpHandlers implements StatelessHttpHandlers {
  private readonly config: ResolvedStatelessConfig;
  private readonly manager: SispManager;
  private readonly buildRequestPayload: BuildRequestPayloadAction;
  private readonly callbackVerifier: CallbackVerifier;
  private readonly urlSigner: UrlSigner;
  private readonly events: SispEventEmitter;
  private readonly sandboxHandlers: SandboxHandlers;

  constructor(deps: StatelessHandlersDeps) {
    this.config = deps.config;
    this.manager = deps.manager;
    this.buildRequestPayload = deps.buildRequestPayload;
    this.callbackVerifier = deps.callbackVerifier;
    this.urlSigner = deps.urlSigner;
    this.events = deps.events;
    this.sandboxHandlers = new SandboxHandlers({
      config: deps.config,
      buildSandboxPayload: deps.buildSandboxPayload,
    });
  }

  async handlePayment(request: HttpRequestInfo): Promise<HttpResult> {
    const paymentRequest = await this.prepare(request);

    if (!('merchantRef' in paymentRequest)) {
      return paymentRequest;
    }

    const fields = paymentRequestToFormFields(paymentRequest);

    return html(
      renderAutoSubmitForm(
        buildGatewayFormAction(this.manager, fields),
        fields,
        'Redirecting to SISP',
      ),
    );
  }

  async handlePaymentIntent(request: HttpRequestInfo): Promise<HttpResult> {
    const paymentRequest = await this.prepare(request);

    if (!('merchantRef' in paymentRequest)) {
      return paymentRequest;
    }

    const fields = paymentRequestToFormFields(paymentRequest);

    return json({
      action: buildGatewayFormAction(this.manager, fields),
      fields,
      ref: paymentRequest.merchantRef,
    });
  }

  async handleCallback(request: HttpRequestInfo): Promise<HttpResult> {
    if (booleanFromInput(request.body.UserCancelled ?? request.query.UserCancelled)) {
      return await this.rejectCancelled(request);
    }

    if (request.method.toUpperCase() === 'GET') {
      return this.readResult(request);
    }

    const payload = callbackPayloadFrom(request.body);
    const outcome = await this.callbackVerifier.verify(payload);

    return this.respondWithOutcome(outcome);
  }

  async handleSandbox(request: HttpRequestInfo): Promise<HttpResult> {
    return this.sandboxHandlers.handleSandbox(request);
  }

  handleCountries(): HttpResult {
    return this.sandboxHandlers.handleCountries();
  }

  private async prepare(request: HttpRequestInfo): Promise<PaymentRequest | HttpResult> {
    if (this.config.correlation === null) {
      throw new CorrelationRequiredError(
        'A payment correlation store is required to build payments in stateless mode.',
      );
    }

    const validation = validatePaymentInput(request.body, this.config.paymentValidation);

    if (!validation.valid) {
      return json({ message: 'The given data was invalid.', errors: validation.errors }, 422);
    }

    const paymentRequest = this.buildRequestPayload.handle(paymentRequestDataFrom(request.body));

    await this.config.correlation.record(paymentRequest);

    return paymentRequest;
  }

  private async rejectCancelled(request: HttpRequestInfo): Promise<HttpResult> {
    const payload = cancellationPayloadFrom(request);

    if (this.config.correlation !== null) {
      const claim = await this.config.correlation.claim(
        payload.merchantRef,
        payload.merchantSession,
      );

      if (claim.status === 'claimed') {
        this.events.emit('callback:rejected', {
          payload,
          status: TransactionStatus.Cancelled,
          reason: CallbackRejectionReasons.UserCancelled,
        });

        await this.config.correlation.markProcessed(payload.merchantRef, payload.merchantSession, {
          verified: false,
          status: TransactionStatus.Cancelled,
          reason: CallbackRejectionReasons.UserCancelled,
          payload,
        });
      }
    }

    return redirect(this.config.redirectUrl);
  }

  private respondWithOutcome(outcome: CallbackOutcome): HttpResult {
    const data = statelessResultData(
      outcome.payload,
      outcome.status,
      outcome.reason,
      this.config.languageMessages.slice(0, 2).toLowerCase(),
    );

    if (this.config.appKey === null || this.config.appKey === '') {
      return json(data);
    }

    const signed = signStatelessResult(this.urlSigner, `${this.config.basePath}/callback`, data);

    return redirect(`${this.config.baseUrl}${signed}`);
  }

  private readResult(request: HttpRequestInfo): HttpResult {
    if (this.config.appKey === null || this.config.appKey === '') {
      return redirect(this.config.redirectUrl);
    }

    const data = readStatelessResult(
      this.urlSigner,
      `${this.config.basePath}/callback`,
      request.query,
      this.config.languageMessages.slice(0, 2).toLowerCase(),
    );

    if (data === null) {
      return redirect(this.config.redirectUrl);
    }

    return json(data);
  }
}
