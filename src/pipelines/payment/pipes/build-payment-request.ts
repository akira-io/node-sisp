import type { BuildRequestPayloadAction } from '../../../actions/build-request-payload';
import type { PaymentPipe } from '../../../contracts/pipes';
import type { PaymentContext } from '../payment-context';

export class BuildPaymentRequest implements PaymentPipe {
  constructor(private readonly buildRequestPayload: BuildRequestPayloadAction) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    context.paymentRequest = this.buildRequestPayload.handle(context.data);

    await next();
  }
}
