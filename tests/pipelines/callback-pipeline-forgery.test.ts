import { describe, expect, it, vi } from 'vitest';
import { CallbackContext } from '../../src/application/pipelines/callback/callback-context';
import {
  createPendingTransaction,
  signedCallback,
  useCallbackPipeline,
} from './callback-pipeline-harness';

const h = useCallbackPipeline();

describe('HandleCallbackPipeline forgery and legacy rows', () => {
  it('rejects an invalid fingerprint without touching the transaction', async () => {
    const pending = await createPendingTransaction(h);
    const failed = vi.fn();
    h.events.on('payment:failed', failed);

    const payload = { ...signedCallback(), fingerprint: 'tampered' };
    const context = await h.pipeline.run(new CallbackContext(payload));
    const [attempt] = await h.attempts.listByTransaction(pending.id);
    const stored = await h.transactions.findById(pending.id);

    expect(context.failureReason).toBe('invalid_callback_fingerprint');
    expect(context.transactionStatusPropagated).toBe(false);
    expect(stored?.status).toBe('pending');
    expect(stored?.merchant_response).toBeNull();
    expect(attempt?.status).toBe('pending');
    expect(attempt?.gateway_transaction_id).toBeNull();
    expect(failed).not.toHaveBeenCalled();
  });

  it('does not backfill a legacy attempt for a callback with an invalid fingerprint', async () => {
    const legacy = await h.transactions.create({
      merchantRef: 'R20260612100000',
      merchantSession: 'S20260612100000',
      amount: '1500',
      currency: '132',
      transactionCode: '1',
    });

    const context = await h.pipeline.run(
      new CallbackContext({ ...signedCallback(), fingerprint: 'tampered' }),
    );

    expect(context.failureReason).toBe('invalid_callback_fingerprint');
    expect(await h.attempts.listByTransaction(legacy.id)).toHaveLength(0);
    expect((await h.transactions.findById(legacy.id))?.status).toBe('pending');
  });

  it('backfills the legacy attempt only once the fingerprint verifies', async () => {
    const legacy = await h.transactions.create({
      merchantRef: 'R20260612100000',
      merchantSession: 'S20260612100000',
      amount: '1500',
      currency: '132',
      transactionCode: '1',
    });

    const context = await h.pipeline.run(new CallbackContext(signedCallback()));
    const [attempt] = await h.attempts.listByTransaction(legacy.id);

    expect(context.failed()).toBe(false);
    expect(context.requireTransaction().status).toBe('completed');
    expect(attempt?.status).toBe('completed');
    expect(attempt?.gateway_transaction_id).toBe('TID-12345');
  });

  it('applies the genuine callback after a forged one was rejected', async () => {
    const pending = await createPendingTransaction(h);
    const completed = vi.fn();
    h.events.on('payment:completed', completed);

    await h.pipeline.run(new CallbackContext({ ...signedCallback(), fingerprint: 'tampered' }));
    const context = await h.pipeline.run(new CallbackContext(signedCallback()));
    const stored = await h.transactions.findById(pending.id);

    expect(context.failed()).toBe(false);
    expect(stored?.status).toBe('completed');
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('keeps a completed transaction completed when a forged callback arrives', async () => {
    const pending = await createPendingTransaction(h);
    const failed = vi.fn();
    h.events.on('payment:failed', failed);

    await h.pipeline.run(new CallbackContext(signedCallback()));
    const context = await h.pipeline.run(
      new CallbackContext({ ...signedCallback({ messageType: '6' }), fingerprint: 'tampered' }),
    );
    const stored = await h.transactions.findById(pending.id);

    expect(context.failureReason).toBe('invalid_callback_fingerprint');
    expect(stored?.status).toBe('completed');
    expect(failed).not.toHaveBeenCalled();
  });
});
