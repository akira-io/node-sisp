import type { PaymentPipe } from '../../contracts/pipes';
import { runPipes } from '../pipeline';
import type { PaymentContext } from './payment-context';

export class ProcessPaymentPipeline {
  constructor(private readonly pipes: readonly PaymentPipe[]) {}

  async run(context: PaymentContext): Promise<PaymentContext> {
    return runPipes(context, this.pipes);
  }
}
