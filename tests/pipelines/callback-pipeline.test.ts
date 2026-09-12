import { describe, expect, it, vi } from 'vitest';
import { CallbackContext } from '../../src/application/pipelines/callback/callback-context';
import { TransactionNotFoundError } from '../../src/domain/errors/exceptions';
import {
  createPendingTransaction,
  signedCallback,
  signedErrorCallback,
  useCallbackPipeline,
} from './callback-pipeline-harness';

const h = useCallbackPipeline();

describe('HandleCallbackPipeline', () => {
  it('completes a pending transaction on a valid success callback', async () => {
    await createPendingTransaction(h);
    const completed = vi.fn();
    h.events.on('payment:completed', completed);

    const context = await h.pipeline.run(new CallbackContext(signedCallback()));

    expect(context.failed()).toBe(false);

    const transaction = context.requireTransaction();

    expect(transaction.status).toBe('completed');
    expect(transaction.transaction_id).toBe('TID-12345');
    expect(transaction.message_type).toBe('8');
    expect(completed).toHaveBeenCalledTimes(1);

    const entries = await h.logs.listByTransaction(transaction.id);

    expect(entries.at(-1)?.source).toBe('callback');
  });

  it('ignores a replayed programmatic callback without dispatching another event', async () => {
    await createPendingTransaction(h);
    const completed = vi.fn();
    h.events.on('payment:completed', completed);

    const payload = signedCallback();
    const first = await h.pipeline.run(new CallbackContext(payload));
    const replay = await h.pipeline.run(new CallbackContext(payload));
    const entries = await h.logs.listByTransaction(first.requireTransaction().id);

    expect(first.transactionStatusPropagated).toBe(true);
    expect(replay.transactionStatusPropagated).toBe(false);
    expect(replay.requireTransaction().status).toBe('completed');
    expect(completed).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
  });

  it('deduplicates concurrent callback replays inside the pipeline', async () => {
    await createPendingTransaction(h);
    const completed = vi.fn();
    h.events.on('payment:completed', completed);

    const payload = signedCallback();
    const [first, second] = await Promise.all([
      h.pipeline.run(new CallbackContext(payload)),
      h.pipeline.run(new CallbackContext(payload)),
    ]);
    const entries = await h.logs.listByTransaction(first.requireTransaction().id);
    const propagated = [first, second].filter((context) => context.transactionStatusPropagated);

    expect(propagated).toHaveLength(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
  });

  it('rolls back attempt updates when the propagated success transaction write fails', async () => {
    const transaction = await createPendingTransaction(h);

    await h.db.schema.dropTable(h.config.tables.transactionLogs);

    await expect(h.pipeline.run(new CallbackContext(signedCallback()))).rejects.toThrow();

    const [attempt] = await h.attempts.listByTransaction(transaction.id);
    const stored = await h.transactions.findById(transaction.id);

    expect(attempt?.gateway_transaction_id).toBeNull();
    expect(attempt?.status).toBe('pending');
    expect(stored?.transaction_id).toBeNull();
    expect(stored?.status).toBe('pending');
  });

  it('rolls back attempt updates when a propagated failure transaction write fails', async () => {
    const transaction = await createPendingTransaction(h);

    await h.db.schema.dropTable(h.config.tables.transactionLogs);

    const payload = signedCallback({ merchantRespCP: '99' });

    await expect(h.pipeline.run(new CallbackContext(payload))).rejects.toThrow();

    const [attempt] = await h.attempts.listByTransaction(transaction.id);
    const stored = await h.transactions.findById(transaction.id);

    expect(attempt?.gateway_transaction_id).toBeNull();
    expect(attempt?.status).toBe('pending');
    expect(stored?.transaction_id).toBeNull();
    expect(stored?.status).toBe('pending');
  });

  it('fails the transaction when callback details do not match', async () => {
    await createPendingTransaction(h, '9999');
    const failed = vi.fn();
    h.events.on('payment:failed', failed);

    const context = await h.pipeline.run(new CallbackContext(signedCallback()));

    expect(context.failureReason).toBe('callback_details_mismatch');
    expect(context.requireTransaction().merchant_response).toBe('callback_details_mismatch');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('rejects callbacks signed for another posID', async () => {
    await createPendingTransaction(h);

    const context = await h.pipeline.run(new CallbackContext(signedCallback({ posID: '99999' })));

    expect(context.failureReason).toBe('callback_details_mismatch');
  });

  it('fails a transaction on a verified error callback without calling it a mismatch', async () => {
    await createPendingTransaction(h);
    const failed = vi.fn();
    h.events.on('payment:failed', failed);

    const context = await h.pipeline.run(new CallbackContext(signedErrorCallback()));

    expect(context.failureReason).toBeNull();
    expect(context.requireTransaction().status).toBe('failed');
    expect(context.requireTransaction().message_type).toBe('6');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('does not reprocess a replayed error callback', async () => {
    await createPendingTransaction(h);
    const failed = vi.fn();
    h.events.on('payment:failed', failed);

    const payload = signedErrorCallback();

    await h.pipeline.run(new CallbackContext(payload));
    const replay = await h.pipeline.run(new CallbackContext(payload));

    expect(replay.transactionStatusPropagated).toBe(false);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('rejects an error callback whose signed fields were tampered with', async () => {
    await createPendingTransaction(h);
    const payload = signedErrorCallback();

    const context = await h.pipeline.run(
      new CallbackContext({ ...payload, additionalErrorMessage: 'Pagamento aceite' }),
    );

    expect(context.failureReason).toBe('invalid_callback_fingerprint');
  });

  it.each([
    'posID',
    'currency',
    'transactionCode',
    'merchantRespPurchaseAmount',
  ])('accepts success callbacks that omit %s', async (field) => {
    await createPendingTransaction(h);

    const context = await h.pipeline.run(new CallbackContext(signedCallback({}, [field])));

    expect(context.failed()).toBe(false);
    expect(context.requireTransaction().status).toBe('completed');
  });

  it('rejects callbacks that provide a mismatching currency', async () => {
    await createPendingTransaction(h);

    const context = await h.pipeline.run(new CallbackContext(signedCallback({ currency: '840' })));

    expect(context.failureReason).toBe('callback_details_mismatch');
  });

  it('rejects callbacks that provide a mismatching transactionCode', async () => {
    await createPendingTransaction(h);

    const context = await h.pipeline.run(
      new CallbackContext(signedCallback({ transactionCode: '9' })),
    );

    expect(context.failureReason).toBe('callback_details_mismatch');
  });

  it('marks error message types as failed', async () => {
    await createPendingTransaction(h);
    const failed = vi.fn();
    h.events.on('payment:failed', failed);

    const context = await h.pipeline.run(new CallbackContext(signedCallback({ messageType: '6' })));

    expect(context.failureReason).toBeNull();
    expect(context.requireTransaction().status).toBe('failed');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown message types pending and emits payment:pending', async () => {
    await createPendingTransaction(h);
    const pending = vi.fn();
    h.events.on('payment:pending', pending);

    const context = await h.pipeline.run(new CallbackContext(signedCallback({ messageType: 'Z' })));

    expect(context.requireTransaction().status).toBe('pending');
    expect(pending).toHaveBeenCalledTimes(1);
  });

  it('throws when no transaction matches the callback', async () => {
    await expect(h.pipeline.run(new CallbackContext(signedCallback()))).rejects.toThrow(
      TransactionNotFoundError,
    );
  });
});
