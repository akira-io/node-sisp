import { describe, expect, it } from 'vitest';
import {
  credentialsFromConfig,
  resolveConfig,
  type SispConfig,
} from '../../src/application/config';
import { BuildSandboxPayloadAction } from '../../src/application/sandbox';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { validateCallbackFingerprint } from '../../src/infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';
import { SandboxHandlers } from '../../src/infrastructure/http/sandbox-handlers';
import { extractForm } from '../helpers/auto-submit-form';

function handlersFor(overrides: Partial<SispConfig> = {}) {
  const config = resolveConfig({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    baseUrl: 'http://localhost:3000',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    ...overrides,
  });

  return new SandboxHandlers({
    config,
    buildSandboxPayload: new BuildSandboxPayloadAction(
      config,
      new StaticCredentialsResolver(credentialsFromConfig(config)),
    ),
  });
}

function request(input: Record<string, unknown>) {
  return {
    method: 'POST',
    body: input,
    query: {},
    headers: {},
  } as never;
}

const identifiers = { merchantRef: 'R1', merchantSession: 'S1', amount: '1500' };

describe('sandbox outcome chooser', () => {
  it('renders the chooser instead of auto-submitting when no status is given', async () => {
    const result = await handlersFor().handleSandbox(request(identifiers));

    if (result.type !== 'html') {
      throw new Error(`Expected html, got ${result.type}.`);
    }

    expect(result.html).not.toContain('onload=');
    expect(result.html).toContain('R1');
    expect(result.html).toContain('S1');

    for (const outcome of ['success', 'failed', 'cancelled', 'tampered']) {
      expect(result.html).toContain(`value='${outcome}'`);
    }
  });

  it('does not repeat the fields the chooser owns when they arrive in the request', async () => {
    const result = await handlersFor().handleSandbox(
      request({ ...identifiers, status: '  ', errorCode: 'Z' }),
    );

    if (result.type !== 'html') {
      throw new Error(`Expected html, got ${result.type}.`);
    }

    expect(result.html.match(/name='errorCode'/g)).toHaveLength(1);
    expect(result.html).toContain("name='errorCode' value='Z'");
    expect(result.html).not.toContain("type='hidden' name='status'");
  });

  it('auto-submits without the chooser when a status is given', async () => {
    const result = await handlersFor().handleSandbox(
      request({ ...identifiers, status: 'success' }),
    );

    if (result.type !== 'html') {
      throw new Error(`Expected html, got ${result.type}.`);
    }

    expect(result.html).toContain('onload=');

    const form = extractForm(result.html);

    expect(form.action).toBe('http://localhost:3000/sisp/callback');
    expect(form.fields.messageType).toBe('8');
  });

  it('builds a cancellation with no message type and no fingerprint', async () => {
    const result = await handlersFor().handleSandbox(
      request({ ...identifiers, status: 'cancelled' }),
    );

    if (result.type !== 'html') {
      throw new Error(`Expected html, got ${result.type}.`);
    }

    const form = extractForm(result.html);

    expect(form.fields.UserCancelled).toBe('true');
    expect(form.fields.merchantRef).toBe('R1');
    expect(form.fields.merchantSession).toBe('S1');
    expect(form.fields.messageType).toBeUndefined();
    expect(form.fields.resultFingerPrint).toBeUndefined();
  });

  it('breaks the fingerprint of an otherwise valid callback when tampering', async () => {
    const result = await handlersFor().handleSandbox(
      request({ ...identifiers, status: 'tampered' }),
    );

    if (result.type !== 'html') {
      throw new Error(`Expected html, got ${result.type}.`);
    }

    const payload = callbackPayloadFrom(extractForm(result.html).fields);

    expect(payload.messageType).toBe('8');
    expect(payload.fingerprint).not.toBe('');
    expect(validateCallbackFingerprint(computeToken('TEST_POS_AUT_CODE'), payload)).toBe(false);
  });

  it('carries a hand written error code into a correctly signed payload', async () => {
    const result = await handlersFor().handleSandbox(
      request({
        ...identifiers,
        status: 'failed',
        errorCode: 'Z',
        errorDescription: 'Something specific',
        errorDetail: 'Detail worth reading',
        additionalErrorMessage: 'Mensagem ao cliente',
      }),
    );

    if (result.type !== 'html') {
      throw new Error(`Expected html, got ${result.type}.`);
    }

    const payload = callbackPayloadFrom(extractForm(result.html).fields);

    expect(payload.errorCode).toBe('Z');
    expect(payload.errorDescription).toBe('Something specific');
    expect(payload.errorDetail).toBe('Detail worth reading');
    expect(payload.additionalErrorMessage).toBe('Mensagem ao cliente');
    expect(validateCallbackFingerprint(computeToken('TEST_POS_AUT_CODE'), payload)).toBe(true);
  });

  it('generates identifiers for a cancellation posted without them', async () => {
    const result = await handlersFor().handleSandbox(request({ status: 'cancelled' }));

    if (result.type !== 'html') {
      throw new Error(`Expected html, got ${result.type}.`);
    }

    const form = extractForm(result.html);

    expect(form.fields.merchantRef).toMatch(/^R[0-9a-z]{14}$/);
    expect(form.fields.merchantSession).toMatch(/^S[0-9a-z]{14}$/);
  });

  it('is unreachable outside sandbox mode', async () => {
    const result = await handlersFor({ sandbox: false }).handleSandbox(request(identifiers));

    expect(result).toEqual({ type: 'json', status: 404, data: { message: 'Not Found' } });
  });
});

describe('sandbox payload statuses', () => {
  function actionFor() {
    const config = resolveConfig({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    return new BuildSandboxPayloadAction(
      config,
      new StaticCredentialsResolver(credentialsFromConfig(config)),
    );
  }

  it.each(['cancelled', 'tampered'])('refuses to build the %s outcome', (status) => {
    expect(() => actionFor().handle({ amount: 100 }, status)).toThrow(
      `The ${status} outcome is built by the sandbox route, not by a callback payload.`,
    );
  });
});

describe('sandbox error payload fidelity', () => {
  function failedPayload() {
    const config = resolveConfig({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    return new BuildSandboxPayloadAction(
      config,
      new StaticCredentialsResolver(credentialsFromConfig(config)),
    ).handle({ amount: 100 }, 'failed');
  }

  it('defaults to the observed decline rather than an invented one', () => {
    const payload = failedPayload();

    expect(payload.errorCode).toBe('F');
    expect(payload.errorDescription).toBe('FALHA NA AUTENTICACAO CLIENTE');
    expect(payload.errorDetail).toBe(payload.errorDescription);
    expect(payload.additionalErrorMessage).toBe(payload.errorDescription);
  });

  it('carries the language field the gateway sends and drops the one it never sends', () => {
    const payload = failedPayload();

    expect(payload.language).toBe('EN');
    expect(payload.screenError).toBe('');
  });
});
