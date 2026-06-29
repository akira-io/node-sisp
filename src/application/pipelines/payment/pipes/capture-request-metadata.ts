import type { PaymentPipe } from '../../../../core/contracts/pipes';
import type { StoreRequestMetadataAction } from '../../../actions/store-request-metadata';
import type { PaymentContext } from '../payment-context';

export class CaptureRequestMetadata implements PaymentPipe {
  constructor(private readonly storeMetadata: StoreRequestMetadataAction) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    await this.storeMetadata.handle(context.request, context.requireTransaction().id);

    await next();
  }
}
