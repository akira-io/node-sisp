import { describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { CallbackRejectionReasons } from '../../src/domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../../src/domain/enums/transaction-status';
import type { HttpRequestInfo } from '../../src/infrastructure/http/request-info';
import { extractForm } from '../helpers/auto-submit-form';

async function statefulSisp(): Promise<Sisp> {
  return createSisp({
    posId: '90000045',
    posAutCode: 'code',
    sandbox: true,
    appKey: 'app-key',
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' }, autoMigrate: true },
  });
}

function paymentRequestInfo(): HttpRequestInfo {
  return {
    ip: '127.0.0.1',
    method: 'POST',
    path: '/sisp/payment',
    headers: {},
    query: {},
    body: {
      amount: '1500',
      items: [{ product_name: 'Bilhete', quantity: 1, unit_price: 1500, total_price: 1500 }],
    },
  };
}

async function submitPayment(
  sisp: Sisp,
): Promise<{ merchantRef: string; merchantSession: string }> {
  const result = await sisp.handlers.handlePayment(paymentRequestInfo());

  if (result.type !== 'html') {
    throw new Error(`Expected an auto-submit form, got ${result.type}.`);
  }

  const { fields } = extractForm(result.html);
  const merchantRef = fields.merchantRef;
  const merchantSession = fields.merchantSession;

  if (merchantRef === undefined || merchantSession === undefined) {
    throw new Error('Payment form did not include merchantRef/merchantSession.');
  }

  return { merchantRef, merchantSession };
}

describe('stateful handleCallback', () => {
  it('returns the transaction alongside the verdict', async () => {
    const sisp = await statefulSisp();
    const { merchantRef, merchantSession } = await submitPayment(sisp);

    const payload = sisp.generateSandboxPayload({ amount: 1500, merchantRef, merchantSession });
    const outcome = await sisp.handleCallback(payload);

    expect(outcome.verified).toBe(true);
    expect(outcome.reason).toBeNull();
    expect(outcome.transaction.merchant_ref).toBe(merchantRef);

    await sisp.destroy();
  });

  it('emits callback:verified in stateful mode too', async () => {
    const sisp = await statefulSisp();
    const listener = vi.fn();

    sisp.on('callback:verified', listener);

    const { merchantRef, merchantSession } = await submitPayment(sisp);

    await sisp.handleCallback(
      sisp.generateSandboxPayload({ amount: 1500, merchantRef, merchantSession }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].reason).toBeNull();

    await sisp.destroy();
  });

  it('verifies but reports a failed status for an authentic decline', async () => {
    const sisp = await statefulSisp();
    const { merchantRef, merchantSession } = await submitPayment(sisp);

    const payload = sisp.generateSandboxPayload(
      { amount: 1500, merchantRef, merchantSession },
      'failed',
    );
    const outcome = await sisp.handleCallback(payload);

    expect(outcome.verified).toBe(true);
    expect(outcome.reason).toBeNull();
    expect(outcome.status).toBe(TransactionStatus.Failed);

    await sisp.destroy();
  });

  it('reports a rejected verdict with a known reason', async () => {
    const sisp = await statefulSisp();
    const { merchantRef, merchantSession } = await submitPayment(sisp);

    const payload = sisp.generateSandboxPayload({ amount: 9999, merchantRef, merchantSession });
    const outcome = await sisp.handleCallback(payload);

    expect(outcome.verified).toBe(false);
    expect(outcome.reason).toBe(CallbackRejectionReasons.DetailsMismatch);

    await sisp.destroy();
  });

  it('no longer exposes handlePaymentCallback', async () => {
    const sisp = await statefulSisp();

    expect('handlePaymentCallback' in sisp).toBe(false);

    await sisp.destroy();
  });

  it('reports correlationConfigured true so statelessSispRoutes mounts POST /payment for a stateful Sisp', async () => {
    const sisp = await statefulSisp();

    expect(sisp.correlationConfigured).toBe(true);

    await sisp.destroy();
  });
});
