import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../src/database/records';
import { type PaymentEvent, SispEventEmitter } from '../src/events';
import { callbackPayloadFrom } from '../src/value-objects/callback-payload';

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
