import { describe, expect, it } from 'vitest';
import { BuildRequestPayloadAction } from '../../src/application/actions/build-request-payload';
import { PaymentBuilder } from '../../src/application/builders/payment-builder';
import {
  credentialsFromConfig,
  resolveConfig,
  type SispConfig,
} from '../../src/application/config';
import { StaticCredentialsResolver } from '../../src/core/contracts/credentials-resolver';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import { customerDataFrom } from '../../src/domain/value-objects/customer-data';
import { paymentRequestDataFrom } from '../../src/domain/value-objects/payment-request-data';
import { sispCredentials } from '../../src/domain/value-objects/sisp-credentials';
import {
  transactionItemCollection,
  transactionItemFrom,
} from '../../src/domain/value-objects/transaction-item-data';
import { transactionStatusResponseFrom } from '../../src/domain/value-objects/transaction-status-response';

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

describe('value object immutability', () => {
  it('freezes value objects created from request data', () => {
    const credentials = sispCredentials({
      posId: '90051',
      transactionStatus: { timeoutSeconds: 10 },
    });
    const paymentData = paymentRequestDataFrom({ amount: '100', merchantRef: 'R1' });
    const callback = callbackPayloadFrom({ merchantRespMerchantRef: 'R1' });
    const customer = customerDataFrom({ customer_email: 'a@b.cv' });
    const item = transactionItemFrom({ product_name: 'Ticket', metadata: { seat: '1A' } });
    const items = transactionItemCollection([{ product_name: 'Ticket' }]);
    const status = transactionStatusResponseFrom({ result: true, msg: 'ok' });

    expect(Object.isFrozen(credentials)).toBe(true);
    expect(Object.isFrozen(credentials.transactionStatus)).toBe(true);
    expect(Object.isFrozen(paymentData)).toBe(true);
    expect(Object.isFrozen(callback)).toBe(true);
    expect(Object.isFrozen(customer)).toBe(true);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.metadata)).toBe(true);
    expect(Object.isFrozen(items)).toBe(true);
    expect(Object.isFrozen(items[0])).toBe(true);
    expect(Object.isFrozen(status)).toBe(true);
    expect(Object.isFrozen(status.raw)).toBe(true);
  });

  it('returns immutable builder data and signed payment requests', () => {
    const builder = builderFor().amount(100).merchantRef('R1');
    const data = builder.toData();
    const request = builder.build();

    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect(() => {
      (data as { amount: number }).amount = 200;
    }).toThrow(TypeError);
    expect(data.amount).toBe(100);
  });
});
