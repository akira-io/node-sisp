import type { PaymentPipe } from '../../../contracts/pipes';
import type { Blacklist } from '../../../database/models/blacklist';
import { BlacklistedIdentifierError } from '../../../exceptions';
import type { PaymentContext } from '../payment-context';

export class EnsureIpIsNotBlacklisted implements PaymentPipe {
  constructor(private readonly blacklist: Blacklist) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    const entry = await this.blacklist.find('ip', context.request.ip);

    if (entry !== null) {
      throw new BlacklistedIdentifierError(`This ip is blacklisted: ${entry.reason ?? ''}`);
    }

    await next();
  }
}
