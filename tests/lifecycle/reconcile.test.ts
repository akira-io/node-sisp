import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { SispError } from '../../src/domain/errors/exceptions';

const fetchMock = vi.fn();

function gatewayResponds(body: Record<string, unknown>, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

let sisp: Sisp;

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();

  sisp = await createSisp({
    posId: '90051',
    posAutCode: 'TEST_POS_AUT_CODE',
    sandbox: true,
    appKey: 'app-key',
    transactionStatus: {
      portalId: 'portal-id',
      portalPassword: 'portal-pass',
      retryDelayMs: 0,
      reconciliationEnabled: true,
      reconcileAfterMinutes: 5,
    },
    database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await sisp.destroy();
});

async function createPendingTransaction(merchantRef = 'R20260612100000', ageMinutes = 10) {
  const transaction = await sisp.models.transactions.create({
    merchantRef,
    merchantSession: `S-${merchantRef}`,
    amount: 1500,
  });

  await sisp
    .db(sisp.config.tables.transactions)
    .where('id', transaction.id)
    .update({ created_at: new Date(Date.now() - ageMinutes * 60_000).toISOString() });

  return (await sisp.models.transactions.findById(transaction.id)) as NonNullable<
    Awaited<ReturnType<typeof sisp.models.transactions.findById>>
  >;
}

describe('queryTransactionStatus', () => {
  it('posts the merchant reference with HTTP Basic portal credentials', async () => {
    gatewayResponds({ result: true, transactionSuccess: true, transactionStatusDescription: 'OK' });

    const response = await sisp.queryTransactionStatus('R1');

    expect(response.result).toBe(true);
    expect(response.transactionSuccess).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://comerciante.vinti4.cv/pos/transaction-status');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('portal-id:portal-pass').toString('base64')}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      posID: '90051',
      posAuthCode: 'TEST_POS_AUT_CODE',
      merchantRef: 'R1',
    });
  });

  it('retries retryable transport failures before returning the gateway response', async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: true, transactionSuccess: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const response = await sisp.queryTransactionStatus('R1');

    expect(response.result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws HTTP failures as transport errors instead of pending responses', async () => {
    gatewayResponds({}, 500);

    await expect(sisp.queryTransactionStatus('R1')).rejects.toThrow(
      'SISP transaction status request failed with HTTP 500.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requires portal credentials', async () => {
    const unconfigured = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    await expect(unconfigured.queryTransactionStatus('R1')).rejects.toThrow(SispError);
    await unconfigured.destroy();
  });
});

describe('reconcileTransactionStatus', () => {
  it('completes a pending transaction when the gateway confirms success', async () => {
    const transaction = await createPendingTransaction();
    gatewayResponds({
      result: true,
      transactionSuccess: true,
      transactionStatusDescription: 'Paid',
    });

    const reconciled = await sisp.reconcileTransactionStatus(transaction);

    expect(reconciled.status).toBe('completed');
    expect(reconciled.merchant_response).toBe('Paid');
    expect(
      (reconciled.payload as Record<string, unknown>).transaction_status_response,
    ).toMatchObject({ result: true });

    const logs = await sisp.models.transactionLogs.listByTransaction(transaction.id);

    expect(logs.at(-1)?.source).toBe('reconciliation');
  });

  it('fails a pending transaction when the gateway reports an unsuccessful payment', async () => {
    const transaction = await createPendingTransaction();
    gatewayResponds({ result: true, transactionSuccess: false, msg: 'Declined' });

    const reconciled = await sisp.reconcileTransactionStatus(transaction);

    expect(reconciled.status).toBe('failed');
    expect(reconciled.merchant_response).toBe('Declined');
  });

  it('keeps the transaction untouched when result is false or transport fails', async () => {
    const transaction = await createPendingTransaction();
    gatewayResponds({ result: false });

    expect((await sisp.reconcileTransactionStatus(transaction)).status).toBe('pending');

    fetchMock.mockRejectedValue(new Error('network down'));

    expect((await sisp.reconcileTransactionStatus(transaction)).status).toBe('pending');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ignores transactions that are not pending', async () => {
    const transaction = await createPendingTransaction();
    const completed = await sisp.models.transactions.update(transaction.id, {
      status: 'completed',
    });

    expect((await sisp.reconcileTransactionStatus(completed)).status).toBe('completed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('reconcilePending', () => {
  it('reconciles old pending transactions up to the limit', async () => {
    await createPendingTransaction('R1', 10);
    await createPendingTransaction('R2', 20);
    await createPendingTransaction('R3', 1);
    gatewayResponds({ result: true, transactionSuccess: true });

    const result = await sisp.reconcilePending({ limit: 1 });

    expect(result).toEqual({ skipped: false, checked: 1, reconciled: 1 });

    const oldest = await sisp.models.transactions.findByRef('R2');

    expect(oldest?.status).toBe('completed');
    expect((await sisp.models.transactions.findByRef('R1'))?.status).toBe('pending');
  });

  it('skips transactions that already have a messageType or are too recent', async () => {
    const withMessage = await createPendingTransaction('R4', 30);
    await sisp.models.transactions.update(withMessage.id, { message_type: 'Z' });
    await createPendingTransaction('R5', 1);
    gatewayResponds({ result: true, transactionSuccess: true });

    const result = await sisp.reconcilePending();

    expect(result).toEqual({ skipped: false, checked: 0, reconciled: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips entirely when reconciliation is disabled and not forced', async () => {
    const disabled = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    expect(await disabled.reconcilePending()).toEqual({
      skipped: true,
      checked: 0,
      reconciled: 0,
    });
    await disabled.destroy();
  });
});
