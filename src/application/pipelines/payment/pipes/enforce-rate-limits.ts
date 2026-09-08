import type { PaymentPipe } from '../../../../core/contracts/pipes';
import type { RateLimitRepository } from '../../../../core/contracts/storage';
import { RateLimitExceededError } from '../../../../domain/errors/exceptions';
import type { RateLimiting } from '../../../config';
import type { PaymentContext } from '../payment-context';

export class EnforceRateLimits implements PaymentPipe {
  constructor(
    private readonly rateLimits: RateLimitRepository,
    private readonly rateLimiting: RateLimiting,
  ) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    if (!this.rateLimiting.enabled || !this.rateLimiting.perIp.enabled) {
      await next();

      return;
    }

    const { limit, windowSeconds } = this.rateLimiting.perIp;
    const identifier = context.request.ip;

    if (identifier === '') {
      await next();

      return;
    }

    const exceeded = await this.rateLimits.hit({
      identifier,
      limitType: 'ip',
      limit,
      windowSeconds,
    });

    if (exceeded) {
      throw new RateLimitExceededError('Too many payment requests. Try again later.');
    }

    await next();
  }
}
