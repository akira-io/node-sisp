import { describe, expect, it } from 'vitest';
import { mapRequestMetadata } from '../../../src/infrastructure/storage/prisma/mapping';
import { mapRateLimitRow } from '../../../src/infrastructure/storage/prisma/rate-limit-row';

const baseTimestamp = '2024-01-15T10:00:00.000Z';
const baseDate = new Date(baseTimestamp);

describe('mapRequestMetadata', () => {
  it('coerces boolean fields', () => {
    const row = {
      id: 1n,
      transactionId: null,
      ipAddress: '10.0.0.1',
      userAgent: null,
      referer: null,
      countryCode: null,
      countryName: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      isp: null,
      deviceType: null,
      browser: null,
      os: null,
      deviceFingerprint: null,
      responseTimeMs: null,
      apiVersion: null,
      isVpn: 0,
      isProxy: 1,
      isMobile: 0,
      riskScore: 25,
      riskReason: null,
      customMetadata: '{"source":"api"}',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const record = mapRequestMetadata(row);

    expect(record.is_vpn).toBe(false);
    expect(record.is_proxy).toBe(true);
    expect(record.is_mobile).toBe(false);
    expect(record.risk_score).toBe(25);
    expect(record.custom_metadata).toEqual({ source: 'api' });
  });
});

describe('mapRateLimitRow', () => {
  it('reads the snake_case column names a raw query returns', () => {
    const mapped = mapRateLimitRow({
      id: 7n,
      identifier: '1.2.3.4',
      limit_type: 'payment',
      context: '',
      hits: 4,
      limit: 10,
      window_seconds: 60,
      reset_at: '2026-09-13T10:00:00.000Z',
      is_blocked: 0,
      blocked_until: null,
    });

    expect(mapped.id).toBe(7n);
    expect(mapped.hits).toBe(4);
    expect(mapped.limit).toBe(10);
    expect(mapped.windowSeconds).toBe(60);
    expect(mapped.resetAt).toBe('2026-09-13T10:00:00.000Z');
    expect(mapped.isBlocked).toBe(0);
    expect(mapped.blockedUntil).toBeNull();
  });

  it('reads Date values from the snake_case columns as returned by the driver', () => {
    const resetAt = new Date('2026-09-13T10:00:00.000Z');
    const blockedUntil = new Date('2026-09-13T10:05:00.000Z');

    const mapped = mapRateLimitRow({
      id: 3,
      hits: 1,
      limit: 5,
      window_seconds: 120,
      reset_at: resetAt,
      is_blocked: true,
      blocked_until: blockedUntil,
    });

    expect(mapped.windowSeconds).toBe(120);
    expect(mapped.resetAt).toBe(resetAt);
    expect(mapped.isBlocked).toBe(true);
    expect(mapped.blockedUntil).toBe(blockedUntil);
  });

  it('defaults blockedUntil to null when the column is absent', () => {
    const mapped = mapRateLimitRow({
      id: 1,
      hits: 0,
      limit: 1,
      window_seconds: 1,
      reset_at: '2026-09-13T10:00:00.000Z',
      is_blocked: false,
    });

    expect(mapped.blockedUntil).toBeNull();
  });
});
