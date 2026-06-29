import type { CallbackPipe } from '../../../../core/contracts/pipes';
import { TransactionStatus } from '../../../../domain/enums/transaction-status';
import type { SispEventEmitter, SispEventName } from '../../../events';
import type { CallbackContext } from '../callback-context';

const STATUS_EVENTS: Partial<Record<TransactionStatus, SispEventName>> = {
  [TransactionStatus.Completed]: 'payment:completed',
  [TransactionStatus.Failed]: 'payment:failed',
  [TransactionStatus.Pending]: 'payment:pending',
};

export class DispatchPaymentEvents implements CallbackPipe {
  constructor(private readonly events: SispEventEmitter) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    if (!context.transactionStatusPropagated) {
      await next();

      return;
    }

    const transaction = context.requireTransaction();
    const eventName = STATUS_EVENTS[transaction.status];

    if (eventName) {
      this.events.emit(eventName, { transaction, payload: context.payload });
    }

    await next();
  }
}
