import type { PaymentPipe } from '../../../../core/contracts/pipes';
import type { BlacklistRepository } from '../../../../core/contracts/storage';
import { BlacklistedIdentifierError } from '../../../../domain/errors/exceptions';
import type { PaymentContext } from '../payment-context';

export class EnsureIpIsNotBlacklisted implements PaymentPipe {
  constructor(private readonly blacklist: BlacklistRepository) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    const entry = await this.blacklist.find('ip', context.request.ip);

    if (entry !== null) {
      throw new BlacklistedIdentifierError(`This ip is blacklisted: ${entry.reason ?? ''}`);
    }

    await next();
  }
}
