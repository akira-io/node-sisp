import type { PaymentPipe } from '../../../core/contracts/pipes';
import { runPipes } from '../pipeline';
import type { PaymentContext } from './payment-context';

export class ProcessPaymentPipeline {
  constructor(
    private readonly pipes: readonly PaymentPipe[],
    private readonly preflightPipes: readonly PaymentPipe[] = [],
  ) {}

  async run(context: PaymentContext): Promise<PaymentContext> {
    if (!context.hasCompletedPreflight()) {
      return runPipes(context, this.pipes);
    }

    return runPipes(
      context,
      this.pipes.filter((pipe) => !this.preflightPipes.includes(pipe)),
    );
  }

  async runPreflight(context: PaymentContext): Promise<PaymentContext> {
    if (context.hasCompletedPreflight() || this.preflightPipes.length === 0) {
      return context;
    }

    await runPipes(context, this.preflightPipes);
    context.markPreflightCompleted();

    return context;
  }
}
