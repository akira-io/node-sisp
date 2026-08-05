import type { CallbackRejectionReason } from '../domain/enums/callback-rejection-reason';
import type { TransactionStatus } from '../domain/enums/transaction-status';
import type { TransactionRecord } from '../domain/records';
import type { CallbackPayload } from '../domain/value-objects/callback-payload';

export interface PaymentEvent {
  transaction: TransactionRecord;
  payload: CallbackPayload;
}

export interface CallbackEvent {
  payload: CallbackPayload;
  status: TransactionStatus;
  reason: CallbackRejectionReason | null;
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
  'callback:verified': CallbackEvent;
  'callback:rejected': CallbackEvent;
  'transaction:cancelled': TransactionCancelledEvent;
  'transaction:refunded': TransactionRefundedEvent;
}

export type SispEventName = keyof SispEventMap;

type AnyEventMap = object;

type Listener<TMap extends AnyEventMap, K extends keyof TMap> = (event: TMap[K]) => unknown;

export type EventErrorHandler<TMap extends AnyEventMap = SispEventMap> = (
  eventName: keyof TMap,
  error: unknown,
) => void;

export class SispEventEmitter<TMap extends AnyEventMap = SispEventMap> {
  private readonly listeners = new Map<keyof TMap, Set<Listener<TMap, keyof TMap>>>();

  constructor(private readonly onListenerError: EventErrorHandler<TMap> = () => {}) {}

  on<K extends keyof TMap>(eventName: K, listener: Listener<TMap, K>): this {
    const registered = this.listeners.get(eventName) ?? new Set();

    registered.add(listener as Listener<TMap, keyof TMap>);
    this.listeners.set(eventName, registered);

    return this;
  }

  once<K extends keyof TMap>(eventName: K, listener: Listener<TMap, K>): this {
    const wrapped: Listener<TMap, K> = (event) => {
      this.off(eventName, wrapped);

      return listener(event);
    };

    return this.on(eventName, wrapped);
  }

  off<K extends keyof TMap>(eventName: K, listener: Listener<TMap, K>): this {
    this.listeners.get(eventName)?.delete(listener as Listener<TMap, keyof TMap>);

    return this;
  }

  emit<K extends keyof TMap>(eventName: K, event: TMap[K]): void {
    const registered = this.listeners.get(eventName);

    if (!registered) {
      return;
    }

    for (const listener of [...registered]) {
      this.invoke(eventName, listener, event);
    }
  }

  private invoke<K extends keyof TMap>(
    eventName: K,
    listener: Listener<TMap, keyof TMap>,
    event: TMap[K],
  ): void {
    try {
      const result = listener(event as TMap[keyof TMap]);

      if (result instanceof Promise) {
        result.catch((error) => this.guardListenerError(eventName, error));
      }
    } catch (error) {
      this.guardListenerError(eventName, error);
    }
  }

  private guardListenerError<K extends keyof TMap>(eventName: K, error: unknown): void {
    try {
      this.onListenerError(eventName, error);
    } catch {}
  }
}
