import type { CallbackContext } from '../pipelines/callback/callback-context';
import type { PaymentContext } from '../pipelines/payment/payment-context';
import type { Pipe } from '../pipelines/pipeline';

export type PaymentPipe = Pipe<PaymentContext>;

export type CallbackPipe = Pipe<CallbackContext>;
