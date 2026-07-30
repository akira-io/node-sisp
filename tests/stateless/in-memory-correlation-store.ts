import type { CallbackOutcome } from '../../src/core/contracts/callback-verifier';
import type {
  CorrelationClaim,
  ExpectedPayment,
  PaymentCorrelationStore,
} from '../../src/core/contracts/payment-correlation-store';
import type { PaymentRequest } from '../../src/domain/value-objects/payment-request';

export class InMemoryPaymentCorrelationStore implements PaymentCorrelationStore {
  private readonly rows = new Map<string, ExpectedPayment>();

  private readonly claimed = new Set<string>();

  readonly recorded: PaymentRequest[] = [];

  readonly processed: Array<{ key: string; outcome: CallbackOutcome }> = [];

  async record(request: PaymentRequest): Promise<void> {
    this.recorded.push(request);
    this.rows.set(key(request.merchantRef, request.merchantSession), {
      amount: request.amount,
      currency: request.currency,
      transactionCode: request.transactionCode,
    });
  }

  async claim(merchantRef: string, merchantSession: string): Promise<CorrelationClaim> {
    const id = key(merchantRef, merchantSession);
    const payment = this.rows.get(id);

    if (payment === undefined) {
      return { status: 'missing' };
    }

    if (this.claimed.has(id)) {
      return { status: 'already_processed' };
    }

    this.claimed.add(id);

    return { status: 'claimed', payment };
  }

  async markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void> {
    this.processed.push({ key: key(merchantRef, merchantSession), outcome });
  }
}

function key(merchantRef: string, merchantSession: string): string {
  return `${merchantRef}::${merchantSession}`;
}
