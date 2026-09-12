import { createHmac } from 'node:crypto';
import type { CredentialsResolver } from '../../../../core/contracts/credentials-resolver';
import type { PaymentPipe } from '../../../../core/contracts/pipes';
import type { RateLimitRepository } from '../../../../core/contracts/storage';
import { RateLimitExceededError } from '../../../../domain/errors/exceptions';
import type { RateLimitHit } from '../../../../domain/storage-types';
import type { PaymentRequestData } from '../../../../domain/value-objects/payment-request-data';
import type { RateLimiting, RateLimitRule } from '../../../config';
import type { PaymentContext } from '../payment-context';

interface ScopedRule {
  rule: RateLimitRule;
  limitType: string;
  identifier: string;
}

export class EnforceRateLimits implements PaymentPipe {
  constructor(
    private readonly rateLimits: RateLimitRepository,
    private readonly rateLimiting: RateLimiting,
    private readonly credentials: CredentialsResolver,
    private readonly appKey: string | null,
  ) {}

  async handle(context: PaymentContext, next: () => Promise<void>): Promise<void> {
    for (const hit of this.hits(context)) {
      if (await this.rateLimits.hit(hit)) {
        throw new RateLimitExceededError('Too many payment requests. Try again later.');
      }
    }

    await next();
  }

  private hits(context: PaymentContext): RateLimitHit[] {
    if (!this.rateLimiting.enabled) {
      return [];
    }

    const scoped: ScopedRule[] = [
      { rule: this.rateLimiting.perIp, limitType: 'ip', identifier: context.request.ip },
      {
        rule: this.rateLimiting.perMerchant,
        limitType: 'merchant',
        identifier: this.credentials.resolve().posId,
      },
      {
        rule: this.rateLimiting.perUser,
        limitType: 'user',
        identifier: customerIdentifier(context.data, this.appKey),
      },
    ];

    return scoped
      .filter(({ rule, identifier }) => rule.enabled && identifier !== '')
      .map(({ rule, limitType, identifier }) => ({
        identifier,
        limitType,
        limit: rule.limit,
        windowSeconds: rule.windowSeconds,
      }));
  }
}

function customerIdentifier(data: PaymentRequestData, appKey: string | null): string {
  const value = normalized(data.customerEmail) ?? normalized(data.customerPhone);

  if (value === null) {
    return '';
  }

  return createHmac('sha256', appKey ?? '')
    .update(value, 'utf8')
    .digest('hex');
}

function normalized(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();

  return trimmed === '' ? null : trimmed;
}
