import { type ResolvedSharedConfig, routeUrl } from '../../application/config';
import type { BuildSandboxPayloadAction } from '../../application/sandbox';
import { callbackPayloadToFormFields } from '../../domain/value-objects/callback-payload';
import { paymentRequestDataFrom } from '../../domain/value-objects/payment-request-data';
import { allCountries } from '../../support/countries';
import { renderAutoSubmitForm } from './auto-submit-form';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json } from './results';

export interface SandboxHandlersDeps {
  config: ResolvedSharedConfig;
  buildSandboxPayload: BuildSandboxPayloadAction;
}

export class SandboxHandlers {
  constructor(private readonly deps: SandboxHandlersDeps) {}

  async handleSandbox(request: HttpRequestInfo): Promise<HttpResult> {
    const { config, buildSandboxPayload } = this.deps;

    if (!config.sandbox) {
      return json({ message: 'Not Found' }, 404);
    }

    const input = { ...request.query, ...request.body };
    const status = typeof input.status === 'string' ? input.status : 'success';

    const payload = buildSandboxPayload.handle(
      paymentRequestDataFrom({ ...input, amount: input.amount ?? '0' }),
      status,
    );

    return html(
      renderAutoSubmitForm(
        routeUrl(config, 'callback'),
        callbackPayloadToFormFields(payload),
        'SISP Sandbox - Processing',
      ),
    );
  }

  handleCountries(): HttpResult {
    return json(allCountries());
  }
}
