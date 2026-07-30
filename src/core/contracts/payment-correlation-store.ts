import type { PaymentRequest } from '../../domain/value-objects/payment-request';
import type { CallbackOutcome } from './callback-verifier';

export interface ExpectedPayment {
  amount: string | number;
  currency?: string;
  transactionCode?: string;
}

export type CorrelationClaim =
  | { status: 'claimed'; payment: ExpectedPayment }
  | { status: 'missing' }
  | { status: 'already_processed' };

export interface PaymentCorrelationStore {
  record(request: PaymentRequest): Promise<void>;
  claim(merchantRef: string, merchantSession: string): Promise<CorrelationClaim>;
  markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void>;
}
