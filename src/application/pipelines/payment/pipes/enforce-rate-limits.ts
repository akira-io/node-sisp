import type { PaymentPipe } from '../../../../core/contracts/pipes';
import { RateLimitExceededError } from '../../../../domain/errors/exceptions';
import type { RateLimit } from '../../../../infrastructure/database/models/rate-limit';
import type { RateLimiting } from '../../../config';
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
