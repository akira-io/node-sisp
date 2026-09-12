import { type ResolvedSharedConfig, routeUrl } from '../../application/config';
import {
  type BuildSandboxPayloadAction,
  OBSERVED_SANDBOX_DECLINE,
  type SandboxErrorOverrides,
} from '../../application/sandbox';
import { callbackPayloadToFormFields } from '../../domain/value-objects/callback-payload';
import { paymentRequestDataFrom } from '../../domain/value-objects/payment-request-data';
import { allCountries } from '../../support/countries';
import { renderAutoSubmitForm } from './auto-submit-form';
import type { HttpRequestInfo } from './request-info';
import { type HttpResult, html, json } from './results';
import { renderSandboxChooser } from './sandbox-chooser';

const TAMPERED_FINGERPRINT = 'tampered-fingerprint';

export interface SandboxHandlersDeps {
  config: ResolvedSharedConfig;
  buildSandboxPayload: BuildSandboxPayloadAction;
}

export class SandboxHandlers {
  constructor(private readonly deps: SandboxHandlersDeps) {}

  async handleSandbox(request: HttpRequestInfo): Promise<HttpResult> {
    const { config } = this.deps;

    if (!config.sandbox) {
      return json({ message: 'Not Found' }, 404);
    }

    const input = { ...request.query, ...request.body } as Record<string, unknown>;
    const status = typeof input.status === 'string' ? input.status.trim() : '';

    if (status === '') {
      return html(
        renderSandboxChooser(
          routeUrl(config, 'sandbox'),
          carriedFields(input),
          declineDefaultsFrom(input),
        ),
      );
    }

    const callbackUrl = routeUrl(config, 'callback');

    if (status === 'cancelled') {
      return html(
        renderAutoSubmitForm(
          callbackUrl,
          cancellationFields(input, config),
          'SISP Sandbox - Cancelling',
        ),
      );
    }

    return html(
      renderAutoSubmitForm(
        callbackUrl,
        this.callbackFields(input, status),
        'SISP Sandbox - Processing',
      ),
    );
  }

  handleCountries(): HttpResult {
    return json(allCountries());
  }

  private callbackFields(
    input: Record<string, unknown>,
    status: string,
  ): Record<string, string | number> {
    const payload = this.deps.buildSandboxPayload.handle(
      paymentRequestDataFrom({ ...input, amount: input.amount ?? '0' }),
      status === 'tampered' ? 'success' : status,
      errorOverridesFrom(input),
    );

    const fields = callbackPayloadToFormFields(payload);

    return status === 'tampered' ? { ...fields, resultFingerPrint: TAMPERED_FINGERPRINT } : fields;
  }
}

function cancellationFields(
  input: Record<string, unknown>,
  config: ResolvedSharedConfig,
): Record<string, string | number> {
  return {
    merchantRef: optionalText(input.merchantRef) ?? config.generators.merchantReference(),
    merchantSession: optionalText(input.merchantSession) ?? config.generators.merchantSession(),
    UserCancelled: 'true',
  };
}

function declineDefaultsFrom(input: Record<string, unknown>): Record<string, string> {
  const overrides = errorOverridesFrom(input);

  return {
    errorCode: overrides.errorCode ?? OBSERVED_SANDBOX_DECLINE.errorCode,
    errorDescription: overrides.errorDescription ?? OBSERVED_SANDBOX_DECLINE.errorDescription,
    errorDetail: overrides.errorDetail ?? OBSERVED_SANDBOX_DECLINE.errorDetail,
    additionalErrorMessage:
      overrides.additionalErrorMessage ?? OBSERVED_SANDBOX_DECLINE.additionalErrorMessage,
  };
}

function errorOverridesFrom(input: Record<string, unknown>): SandboxErrorOverrides {
  return {
    errorCode: optionalText(input.errorCode),
    errorDescription: optionalText(input.errorDescription),
    errorDetail: optionalText(input.errorDetail),
    additionalErrorMessage: optionalText(input.additionalErrorMessage),
  };
}

const CHOOSER_OWNED_FIELDS = ['status', ...Object.keys(OBSERVED_SANDBOX_DECLINE)];

function carriedFields(input: Record<string, unknown>): Record<string, string | number> {
  const carried: Record<string, string | number> = {};

  for (const [name, value] of Object.entries(input)) {
    const isCarryable =
      (typeof value === 'string' || typeof value === 'number') &&
      !CHOOSER_OWNED_FIELDS.includes(name);

    if (isCarryable) {
      carried[name] = value;
    }
  }

  return carried;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
