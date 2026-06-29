import { describe, expect, it } from 'vitest';
import { credentialsFromConfig, resolveConfig, type SispConfig } from '../src/config';
import { StaticCredentialsResolver } from '../src/contracts/credentials-resolver';
import { validateCallbackFingerprint } from '../src/fingerprints/callback-fingerprint';
import { computeToken } from '../src/fingerprints/token';
import { renderAutoSubmitForm } from '../src/http/auto-submit-form';
import { BuildSandboxPayloadAction } from '../src/sandbox';
import { callbackPayloadToFormFields } from '../src/value-objects/callback-payload';

function actionFor(overrides: Partial<SispConfig> = {}) {
  const config = resolveConfig({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    ...overrides,
  });

  return new BuildSandboxPayloadAction(
    config,
    new StaticCredentialsResolver(credentialsFromConfig(config)),
  );
}

describe('BuildSandboxPayloadAction', () => {
  it('builds a correctly signed success callback payload', () => {
    const payload = actionFor().handle({ amount: 1500, merchantRef: 'R1', merchantSession: 'S1' });

    expect(payload.messageType).toBe('8');
    expect(payload.merchantRef).toBe('R1');
    expect(payload.posID).toBe('90051');
    expect(payload.currency).toBe('132');
    expect(validateCallbackFingerprint(computeToken('TEST_POS_AUT_CODE'), payload)).toBe(true);
  });

  it('builds failed and pending payloads on demand', () => {
    const failed = actionFor().handle({ amount: 100 }, 'failed');
    const pending = actionFor().handle({ amount: 100 }, 'whatever');

    expect(failed.messageType).toBe('6');
    expect(failed.additionalErrorMessage).toBe('Sandbox transaction failed');
    expect(pending.messageType).toBe('P');
    expect(validateCallbackFingerprint(computeToken('TEST_POS_AUT_CODE'), failed)).toBe(true);
  });

  it('fills refs and timestamps from the generators when omitted', () => {
    const payload = actionFor().handle({ amount: 100 });

    expect(payload.merchantRef).toMatch(/^R\d{14}[0-9a-f]{12}$/);
    expect(payload.merchantSession).toMatch(/^S\d{14}[0-9a-f]{12}$/);
    expect(payload.timeStamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(payload.transactionID).toMatch(/^FAKE/);
  });

  it('refuses to build payloads outside sandbox mode', () => {
    expect(() => actionFor({ sandbox: false }).handle({ amount: 100 })).toThrow(
      'Sandbox payloads can only be generated when SISP sandbox mode is enabled.',
    );
  });
});

describe('renderAutoSubmitForm', () => {
  it('renders an auto-submitting form with hidden callback fields', () => {
    const payload = actionFor().handle({ amount: 1500, merchantRef: 'R1', merchantSession: 'S1' });
    const html = renderAutoSubmitForm(
      'http://localhost:3000/sisp/callback',
      callbackPayloadToFormFields(payload),
      'SISP Sandbox - Processing',
    );

    expect(html).toContain("body onload='document.forms[0].submit()'");
    expect(html).toContain("form action='http://localhost:3000/sisp/callback' method='post'");
    expect(html).toContain("name='merchantRespMerchantRef' value='R1'");
    expect(html).toContain("name='resultFingerPrint'");
  });

  it('escapes HTML in field values', () => {
    const html = renderAutoSubmitForm('/cb', { note: `<script>'x'</script>` }, 't');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;&#039;x&#039;&lt;/script&gt;');
  });
});
