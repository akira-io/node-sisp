import type { CallbackOutcome } from '../../src/core/contracts/callback-verifier';
import type {
  CorrelatedPayment,
  PaymentCorrelationStore,
} from '../../src/core/contracts/payment-correlation-store';
import type { PaymentRequest } from '../../src/domain/value-objects/payment-request';

export class InMemoryPaymentCorrelationStore implements PaymentCorrelationStore {
  private readonly rows = new Map<string, CorrelatedPayment>();

  readonly recorded: PaymentRequest[] = [];

  readonly processed: Array<{ key: string; outcome: CallbackOutcome }> = [];

  async record(request: PaymentRequest): Promise<void> {
    this.recorded.push(request);
    this.rows.set(key(request.merchantRef, request.merchantSession), {
      amount: request.amount,
      currency: request.currency,
      transactionCode: request.transactionCode,
      processedAt: null,
    });
  }

  async find(merchantRef: string, merchantSession: string): Promise<CorrelatedPayment | null> {
    return this.rows.get(key(merchantRef, merchantSession)) ?? null;
  }

  async markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void> {
    const id = key(merchantRef, merchantSession);
    const row = this.rows.get(id);

    this.processed.push({ key: id, outcome });

    if (row) {
      this.rows.set(id, { ...row, processedAt: new Date() });
    }
  }
}

function key(merchantRef: string, merchantSession: string): string {
  return `${merchantRef}::${merchantSession}`;
}
