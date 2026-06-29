import type { CallbackContext } from '../../application/pipelines/callback/callback-context';
import type { PaymentContext } from '../../application/pipelines/payment/payment-context';
import type { Pipe } from '../../application/pipelines/pipeline';

export type PaymentPipe = Pipe<PaymentContext>;

export type CallbackPipe = Pipe<CallbackContext>;
