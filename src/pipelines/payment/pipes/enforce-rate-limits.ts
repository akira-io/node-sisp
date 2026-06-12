import type { RateLimiting } from '../../../config';
import type { PaymentPipe } from '../../../contracts/pipes';
import type { RateLimit } from '../../../database/models/rate-limit';
import { RateLimitExceededError } from '../../../exceptions';
import type { PaymentContext } from '../payment-context';

export class EnforceRateLimits implements PaymentPipe {
  constructor(
    private readonly rateLimits: RateLimit,
    private readonly rateLimiting: RateLimiting,
  ) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    if (!this.rateLimiting.enabled || !this.rateLimiting.perIp.enabled) {
      await next();

      return;
    }

    const { limit, windowSeconds } = this.rateLimiting.perIp;
    const identifier = context.request.ip;

    const exceeded = await this.rateLimits.hit({
      identifier,
      limitType: 'ip',
      limit,
      windowSeconds,
    });

    if (exceeded) {
      throw new RateLimitExceededError(
        `Rate limit exceeded for ip: ${identifier}. Limit: ${limit} requests per ${windowSeconds} seconds`,
      );
    }

    await next();
  }
}
