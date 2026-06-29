import { describe, expect, it } from 'vitest';
import { BuildRequestPayloadAction } from '../../src/application/actions/build-request-payload';
import { PaymentBuilder } from '../../src/application/builders/payment-builder';
import {
  credentialsFromConfig,
  resolveConfig,
  type SispConfig,
} from '../../src/application/config';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { MissingThreeDSecureDataError } from '../../src/domain/errors/exceptions';
import { generatePaymentFingerprint } from '../../src/infrastructure/fingerprints/payment-fingerprint';
import { computeToken } from '../../src/infrastructure/fingerprints/token';

function builderFor(overrides: Partial<SispConfig> = {}) {
  const config = resolveConfig({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    url: 'https://gateway.vinti4.test/payment',
    baseUrl: 'http://localhost:3000',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    ...overrides,
  });

  return new PaymentBuilder(
    new BuildRequestPayloadAction(
      config,
      new StaticCredentialsResolver(credentialsFromConfig(config)),
    ),
  );
}

describe('PaymentBuilder', () => {
  it('builds a signed payment request with explicit values', () => {
    const request = builderFor()
      .amount(1500.5)
      .merchantRef('R20260612100000')
      .merchantSession('S20260612100000')
      .timeStamp('2026-06-12 10:00:00')
      .currency('132')
      .transactionCode('1')
      .build();

    expect(request.posID).toBe('90051');
    expect(request.urlMerchantResponse).toBe('http://localhost:3000/sisp/callback');
    expect(request.languageMessages).toBe('EN');
    expect(request.fingerprintversion).toBe('1');
    expect(request.is3DSec).toBe('0');
    expect(request.purchaseRequest).toBe('');
    expect(request.fingerprint).toBe(
      generatePaymentFingerprint(computeToken('TEST_POS_AUT_CODE'), {
        amount: 1500.5,
        timeStamp: '2026-06-12 10:00:00',
        merchantRef: 'R20260612100000',
        merchantSession: 'S20260612100000',
        posID: '90051',
        currency: '132',
        transactionCode: '1',
      }),
    );
  });

  it('fills refs, session, and timestamp from the configured generators', () => {
    const request = builderFor().amount(100).build();

    expect(request.merchantRef).toMatch(/^R\d{14}[0-9a-f]{12}$/);
    expect(request.merchantSession).toMatch(/^S\d{14}[0-9a-f]{12}$/);
    expect(request.timeStamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(request.transactionCode).toBe('1');
    expect(request.currency).toBe('132');
    expect(request.locale).toBe('pt_PT');
  });

  it('honors an explicit urlMerchantResponse', () => {
    const request = builderFor({ urlMerchantResponse: 'https://app.test/webhook' })
      .amount(100)
      .build();

    expect(request.urlMerchantResponse).toBe('https://app.test/webhook');
  });

  it('requires an amount greater than zero', () => {
    expect(() => builderFor().build()).toThrow('A payment amount greater than zero is required.');
    expect(() => builderFor().amount(0).build()).toThrow(
      'A payment amount greater than zero is required.',
    );
  });

  it('requires full customer data for 3-D Secure payments', () => {
    expect(() => builderFor({ is3DSec: '1' }).amount(100).customerEmail('a@b.cv').build()).toThrow(
      MissingThreeDSecureDataError,
    );
  });

  it('builds the base64 purchaseRequest for 3-D Secure payments', () => {
    const request = builderFor({ is3DSec: '1' })
      .amount(100)
      .customerEmail('a@b.cv')
      .customerCountry('CV')
      .customerCity('Praia')
      .customerAddress('Rua 1')
      .customerPostalCode('7600')
      .customerPhone('9911223')
      .build();

    const decoded = JSON.parse(Buffer.from(request.purchaseRequest, 'base64').toString('utf8'));

    expect(decoded.email).toBe('a@b.cv');
    expect(decoded.billAddrCountry).toBe('132');
    expect(decoded.billAddrCity).toBe('Praia');
    expect(decoded.mobilePhone).toEqual({ cc: '238', subscriber: '9911223' });
    expect(decoded.acctID).toBe('x');
    expect(decoded.acctInfo.chAccDate).toMatch(/^\d{8}$/);
  });
});
