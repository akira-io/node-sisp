import type { PaymentRequest } from '../../domain/value-objects/payment-request';
import type { CallbackOutcome } from './callback-verifier';

export interface ExpectedPayment {
  amount: string | number;
  currency?: string;
  transactionCode?: string;
}

export interface CorrelatedPayment extends ExpectedPayment {
  processedAt?: Date | string | null;
}

export interface PaymentCorrelationStore {
  record(request: PaymentRequest): Promise<void>;
  find(merchantRef: string, merchantSession: string): Promise<CorrelatedPayment | null>;
  markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void>;
}
