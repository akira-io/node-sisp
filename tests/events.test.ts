import { describe, expect, it, vi } from 'vitest';
import { type CallbackEvent, type PaymentEvent, SispEventEmitter } from '../src/application/events';
import { CallbackRejectionReasons } from '../src/domain/enums/callback-rejection-reason';
import { TransactionStatus } from '../src/domain/enums/transaction-status';
import { callbackPayloadFrom } from '../src/domain/value-objects/callback-payload';
import type { TransactionRecord } from '../src/infrastructure/storage/knex/records';

const event: PaymentEvent = {
  transaction: { id: 1, status: 'completed' } as TransactionRecord,
  payload: callbackPayloadFrom({ messageType: '8' }),
};

describe('SispEventEmitter', () => {
  it('delivers events to registered listeners', () => {
    const emitter = new SispEventEmitter();
    const listener = vi.fn();

    emitter.on('payment:completed', listener);
    emitter.emit('payment:completed', event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('does not deliver events for other names or removed listeners', () => {
    const emitter = new SispEventEmitter();
    const listener = vi.fn();

    emitter.on('payment:failed', listener);
    emitter.emit('payment:completed', event);
    emitter.off('payment:failed', listener);
    emitter.emit('payment:failed', event);

    expect(listener).not.toHaveBeenCalled();
  });

  it('fires once listeners a single time', () => {
    const emitter = new SispEventEmitter();
    const listener = vi.fn();

    emitter.once('payment:completed', listener);
    emitter.emit('payment:completed', event);
    emitter.emit('payment:completed', event);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never lets a throwing listener break the emit', () => {
    const errors: unknown[] = [];
    const emitter = new SispEventEmitter((_name, error) => {
      errors.push(error);
    });
    const second = vi.fn();

    emitter.on('payment:completed', () => {
      throw new Error('listener exploded');
    });
    emitter.on('payment:completed', second);

    expect(() => emitter.emit('payment:completed', event)).not.toThrow();
    expect(second).toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });

  it('routes async listener rejections to the error handler', async () => {
    const onError = vi.fn();
    const emitter = new SispEventEmitter(onError);

    emitter.on('payment:completed', async () => {
      throw new Error('async failure');
    });
    emitter.emit('payment:completed', event);

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith('payment:completed', expect.any(Error));
    });
  });
});

describe('callback events', () => {
  const callbackEvent: CallbackEvent = {
    payload: callbackPayloadFrom({ messageType: '8' }),
    status: TransactionStatus.Completed,
    reason: null,
  };

  it('delivers callback:verified with a null reason', () => {
    const emitter = new SispEventEmitter();
    const listener = vi.fn();

    emitter.on('callback:verified', listener);
    emitter.emit('callback:verified', callbackEvent);

    expect(listener).toHaveBeenCalledWith(callbackEvent);
  });

  it('delivers callback:rejected with the reason set', () => {
    const emitter = new SispEventEmitter();
    const listener = vi.fn();
    const rejected: CallbackEvent = {
      payload: callbackPayloadFrom({ messageType: '6' }),
      status: TransactionStatus.Failed,
      reason: CallbackRejectionReasons.InvalidFingerprint,
    };

    emitter.on('callback:rejected', listener);
    emitter.emit('callback:rejected', rejected);

    expect(listener).toHaveBeenCalledWith(rejected);
  });

  it('accepts a caller-supplied event map', () => {
    const emitter = new SispEventEmitter<{ 'custom:ping': { at: number } }>();
    const listener = vi.fn();

    emitter.on('custom:ping', listener);
    emitter.emit('custom:ping', { at: 7 });

    expect(listener).toHaveBeenCalledWith({ at: 7 });
  });
});
