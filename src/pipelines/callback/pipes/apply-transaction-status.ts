import { mapTransactionStatus } from '../../../actions/map-transaction-status';
import type { CallbackPipe } from '../../../contracts/pipes';
import { runWithLogSource } from '../../../database/log-context';
import type { TransactionRepository } from '../../../database/models/transaction-repository';
import type { CallbackContext } from '../callback-context';

export class ApplyTransactionStatus implements CallbackPipe {
  constructor(private readonly transactions: TransactionRepository) {}

  async handle(context: CallbackContext, next: () => Promise<void>): Promise<void> {
    const transaction = context.requireTransaction();
    const payload = context.payload;

    context.transaction = await runWithLogSource('callback', () =>
      this.transactions.update(transaction.id, {
        transaction_id: String(payload.transactionID),
        message_type: payload.messageType,
        merchant_response: payload.merchantResponse,
        response_code: payload.merchantRespCp,
        fingerprint: payload.fingerprint,
        status: mapTransactionStatus(payload.messageType),
      }),
    );

    await next();
  }
}
