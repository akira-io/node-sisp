import type { CallbackPayload } from '../domain/value-objects/callback-payload';
import type { TransactionRecord } from '../infrastructure/database/records';

export interface PaymentEvent {
  transaction: TransactionRecord;
  payload: CallbackPayload;
}

export interface TransactionCancelledEvent {
  transaction: TransactionRecord;
  reason: string;
}

export interface TransactionRefundedEvent {
  transaction: TransactionRecord;
  amount: number;
  reason: string;
}

export interface SispEventMap {
  'payment:completed': PaymentEvent;
  'payment:failed': PaymentEvent;
  'payment:pending': PaymentEvent;
  'transaction:cancelled': TransactionCancelledEvent;
  'transaction:refunded': TransactionRefundedEvent;
}

export type SispEventName = keyof SispEventMap;

type Listener<K extends SispEventName> = (event: SispEventMap[K]) => unknown;

export type EventErrorHandler = (eventName: SispEventName, error: unknown) => void;

export class SispEventEmitter {
  private readonly listeners = new Map<SispEventName, Set<Listener<SispEventName>>>();

  constructor(private readonly onListenerError: EventErrorHandler = () => {}) {}

  on<K extends SispEventName>(eventName: K, listener: Listener<K>): this {
    const registered = this.listeners.get(eventName) ?? new Set();

    registered.add(listener as Listener<SispEventName>);
    this.listeners.set(eventName, registered);

    return this;
  }

  once<K extends SispEventName>(eventName: K, listener: Listener<K>): this {
    const wrapped: Listener<K> = (event) => {
      this.off(eventName, wrapped);

      return listener(event);
    };

    return this.on(eventName, wrapped);
  }

  off<K extends SispEventName>(eventName: K, listener: Listener<K>): this {
    this.listeners.get(eventName)?.delete(listener as Listener<SispEventName>);

    return this;
  }

  emit<K extends SispEventName>(eventName: K, event: SispEventMap[K]): void {
    const registered = this.listeners.get(eventName);

    if (!registered) {
      return;
    }

    for (const listener of [...registered]) {
      this.invoke(eventName, listener, event);
    }
  }

  private invoke<K extends SispEventName>(
    eventName: K,
    listener: Listener<SispEventName>,
    event: SispEventMap[K],
  ): void {
    try {
      const result = listener(event);

      if (result instanceof Promise) {
        result.catch((error) => this.onListenerError(eventName, error));
      }
    } catch (error) {
      this.onListenerError(eventName, error);
    }
  }
}
