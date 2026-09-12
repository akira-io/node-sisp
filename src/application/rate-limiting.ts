import { booleanSetting } from '../support/settings';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface RateLimitRule {
  enabled: boolean;
  limit: number;
  windowSeconds: number;
}

export interface RateLimiting {
  enabled: boolean;
  perIp: RateLimitRule;
  perIpStatus: RateLimitRule;
  perMerchant: RateLimitRule;
  perUser: RateLimitRule;
}

const DEFAULT_RATE_LIMITING: RateLimiting = {
  enabled: true,
  perIp: { enabled: true, limit: 100, windowSeconds: 3600 },
  perIpStatus: { enabled: true, limit: 3600, windowSeconds: 3600 },
  perMerchant: { enabled: false, limit: 500, windowSeconds: 3600 },
  perUser: { enabled: true, limit: 50, windowSeconds: 3600 },
};

export function resolveRateLimiting(
  overrides: DeepPartial<RateLimiting> | undefined,
): RateLimiting {
  return {
    enabled: booleanSetting(overrides?.enabled, DEFAULT_RATE_LIMITING.enabled),
    perIp: resolveRateLimitRule(DEFAULT_RATE_LIMITING.perIp, overrides?.perIp),
    perIpStatus: resolveRateLimitRule(DEFAULT_RATE_LIMITING.perIpStatus, overrides?.perIpStatus),
    perMerchant: resolveRateLimitRule(DEFAULT_RATE_LIMITING.perMerchant, overrides?.perMerchant),
    perUser: resolveRateLimitRule(DEFAULT_RATE_LIMITING.perUser, overrides?.perUser),
  };
}

function resolveRateLimitRule(
  defaults: RateLimitRule,
  overrides: Partial<RateLimitRule> | undefined,
): RateLimitRule {
  return {
    enabled: booleanSetting(overrides?.enabled, defaults.enabled),
    limit: overrides?.limit ?? defaults.limit,
    windowSeconds: overrides?.windowSeconds ?? defaults.windowSeconds,
  };
}
