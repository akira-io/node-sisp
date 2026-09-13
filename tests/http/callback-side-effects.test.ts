import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sisp } from '../../src/application/sisp';
import { requireKnex } from '../helpers/knex';
import {
  callbackRequest,
  createSideEffectSisp,
  settledTransaction,
  signedCallbackBody,
} from '../helpers/side-effect-sisp';

let sisp: Sisp | null = null;

afterEach(async () => {
  await sisp?.destroy();
  sisp = null;
});

describe('callback route side effect errors', () => {
  it('reports callback metadata failures without breaking the redirect', async () => {
    const onError = vi.fn();
    sisp = await createSideEffectSisp(onError);
    const transaction = await settledTransaction(sisp, 'R20260612100000', 'S20260612100000');
    await requireKnex(sisp).schema.dropTable(sisp.config.tables.requestMetadata);

    const response = await sisp.handlers.handleCallback(
      callbackRequest(signedCallbackBody(transaction.merchant_ref, transaction.merchant_session)),
    );
    const stored = await sisp.models.transactions.findById(transaction.id);

    expect(response.type).toBe('redirect');
    expect(stored?.status).toBe('completed');
    expect(onError).toHaveBeenCalledWith('store_request_metadata', expect.any(Error));
  });

  it('reports invoice status failures under update_invoice_status', async () => {
    const onError = vi.fn();
    sisp = await createSideEffectSisp(onError);
    const transaction = await settledTransaction(sisp, 'R20260612100002', 'S20260612100002');
    await requireKnex(sisp).schema.dropTable(sisp.config.tables.invoices);

    const response = await sisp.handlers.handleCallback(
      callbackRequest(signedCallbackBody(transaction.merchant_ref, transaction.merchant_session)),
    );

    expect(response.type).toBe('redirect');
    expect(onError).toHaveBeenCalledWith('update_invoice_status', expect.any(Error));
  });

  it('still answers the result route when the attempts table is gone', async () => {
    const onError = vi.fn();
    sisp = await createSideEffectSisp(onError);
    const transaction = await settledTransaction(sisp, 'R20260612100005', 'S20260612100005');

    const redirect = await sisp.handlers.handleCallback(
      callbackRequest(signedCallbackBody(transaction.merchant_ref, transaction.merchant_session)),
    );

    if (redirect.type !== 'redirect') {
      throw new Error(`Expected a redirect to the signed result url, got ${redirect.type}.`);
    }

    const query = Object.fromEntries(
      new URL(redirect.location, 'http://localhost').searchParams.entries(),
    );

    await requireKnex(sisp).schema.dropTable(sisp.config.tables.transactionAttempts);

    const response = await sisp.handlers.handleCallback({
      ip: '10.0.0.1',
      method: 'GET',
      path: '/sisp/callback',
      headers: {},
      query,
      body: {},
    });

    if (response.type !== 'json') {
      throw new Error(`Expected the result payload, got ${response.type}.`);
    }

    const data = response.data as {
      transaction: { status: string };
      allowRetry: boolean;
      retryUrl: string | null;
    };

    expect(data.transaction.status).toBe('completed');
    expect(data.allowRetry).toBe(false);
    expect(data.retryUrl).toBeNull();
  });

  it('reports attempt lookup failures under load_current_attempt on the result route', async () => {
    const onError = vi.fn();
    sisp = await createSideEffectSisp(onError);
    const transaction = await settledTransaction(sisp, 'R20260612100003', 'S20260612100003');

    const redirect = await sisp.handlers.handleCallback(
      callbackRequest(signedCallbackBody(transaction.merchant_ref, transaction.merchant_session)),
    );

    if (redirect.type !== 'redirect') {
      throw new Error(`Expected a redirect to the signed result url, got ${redirect.type}.`);
    }

    const query = Object.fromEntries(
      new URL(redirect.location, 'http://localhost').searchParams.entries(),
    );

    await requireKnex(sisp).schema.dropTable(sisp.config.tables.transactionAttempts);

    const response = await sisp.handlers.handleCallback({
      ip: '10.0.0.1',
      method: 'GET',
      path: '/sisp/callback',
      headers: {},
      query,
      body: {},
    });

    expect(response.type).toBe('json');
    expect(onError).toHaveBeenCalledWith('resolve_retry_availability', expect.any(Error));
    expect(onError).toHaveBeenCalledWith('load_current_attempt', expect.any(Error));
  });

  it('reports cancellation failures under cancel_user_cancelled_transaction', async () => {
    const onError = vi.fn();
    sisp = await createSideEffectSisp(onError);
    const rejected = vi.fn();

    sisp.on('callback:rejected', rejected);

    await requireKnex(sisp).schema.dropTable(sisp.config.tables.transactions);

    const response = await sisp.handlers.handleCallback(
      callbackRequest({
        UserCancelled: 'true',
        merchantRef: 'R20260612100004',
        merchantSession: 'S20260612100004',
      }),
    );

    expect(response.type).toBe('redirect');
    expect(rejected).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('cancel_user_cancelled_transaction', expect.any(Error));
  });

  it('does not let a throwing error handler break the callback redirect', async () => {
    const onError = vi.fn(() => {
      throw new Error('handler exploded');
    });
    sisp = await createSideEffectSisp(onError);
    const transaction = await settledTransaction(sisp, 'R20260612100001', 'S20260612100001');
    await requireKnex(sisp).schema.dropTable(sisp.config.tables.requestMetadata);

    const response = await sisp.handlers.handleCallback(
      callbackRequest(signedCallbackBody(transaction.merchant_ref, transaction.merchant_session)),
    );
    const stored = await sisp.models.transactions.findById(transaction.id);

    expect(response.type).toBe('redirect');
    expect(stored?.status).toBe('completed');
    expect(onError).toHaveBeenCalledWith('store_request_metadata', expect.any(Error));
  });
});
