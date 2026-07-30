import type { BuildRequestPayloadAction } from '../../application/actions/build-request-payload';
import { routeUrl } from '../../application/config';
import type { SispEventEmitter } from '../../application/events';
import type { BuildSandboxPayloadAction } from '../../application/sandbox';
import type { ResolvedStatelessConfig } from '../../application/stateless-config';
import type { CallbackOutcome, CallbackVerifier } from '../../core/contracts/callback-verifier';
import { CallbackRejectionReasons } from '../../domain/enums/callback-rejection-reason';
import { CorrelationRequiredError } from '../../domain/errors/exceptions';
import {
  callbackPayloadFrom,
  callbackPayloadToFormFields,
} from '../../domain/value-objects/callback-payload';
import {
  type PaymentRequest,
  paymentRequestToFormFields,
} from '../../domain/value-objects/payment-request';
import { paymentRequestDataFrom } from '../../domain/value-objects/payment-request-data';
import { allCountries } from '../../support/countries';
import type { UrlSigner } from '../../support/signed-url';
import type { SispManager } from '../drivers/sisp-manager';
import { renderAutoSubmitForm } from './auto-submit-form';
import { booleanFromInput } from './callback-processing';
import { buildGatewayFormAction } from './gateway-form-action';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json, redirect } from './results';
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
  private readonly buildSandboxPayload: BuildSandboxPayloadAction;
  private readonly callbackVerifier: CallbackVerifier;
  private readonly urlSigner: UrlSigner;
  private readonly events: SispEventEmitter;

  constructor(deps: StatelessHandlersDeps) {
    this.config = deps.config;
    this.manager = deps.manager;
    this.buildRequestPayload = deps.buildRequestPayload;
    this.buildSandboxPayload = deps.buildSandboxPayload;
    this.callbackVerifier = deps.callbackVerifier;
    this.urlSigner = deps.urlSigner;
    this.events = deps.events;
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
      return this.rejectCancelled(request);
    }

    if (request.method.toUpperCase() === 'GET') {
      return this.readResult(request);
    }

    const payload = callbackPayloadFrom({ ...request.query, ...request.body });
    const outcome = await this.callbackVerifier.verify(payload);

    return this.respondWithOutcome(outcome);
  }

  async handleSandbox(request: HttpRequestInfo): Promise<HttpResult> {
    if (!this.config.sandbox) {
      return json({ message: 'Not Found' }, 404);
    }

    const input = { ...request.query, ...request.body };
    const status = typeof input.status === 'string' ? input.status : 'success';
    const payload = this.buildSandboxPayload.handle(
      paymentRequestDataFrom({ ...input, amount: input.amount ?? '0' }),
      status,
    );

    return html(
      renderAutoSubmitForm(
        routeUrl(this.config, 'callback'),
        callbackPayloadToFormFields(payload),
        'SISP Sandbox - Processing',
      ),
    );
  }

  handleCountries(): HttpResult {
    return json(allCountries());
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

  private rejectCancelled(request: HttpRequestInfo): HttpResult {
    this.events.emit('callback:rejected', {
      payload: callbackPayloadFrom({ ...request.query, ...request.body }),
      reason: CallbackRejectionReasons.UserCancelled,
    });

    return redirect(this.config.redirectUrl);
  }

  private respondWithOutcome(outcome: CallbackOutcome): HttpResult {
    const data = statelessResultData(
      outcome.payload,
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
