import { createHash } from 'node:crypto';
import type { RequestMetadataRepository } from '../../core/contracts/storage';
import type { NewRequestMetadata } from '../../domain/storage-types';
import { type HttpRequestInfo, headerValue } from '../../infrastructure/http/request-info';
import {
  detectBrowser,
  detectDeviceType,
  detectOperatingSystem,
  isMobileDevice,
} from '../../support/user-agent';

const SENSITIVE_KEY_MARKERS = [
  'authorization',
  'cookie',
  'password',
  'passwd',
  'secret',
  'token',
  'card',
  'cvv',
  'cvc',
  'key',
  'pin',
];

export class StoreRequestMetadataAction {
  constructor(private readonly requestMetadata: RequestMetadataRepository) {}

  async handle(request: HttpRequestInfo, transactionId: number | null): Promise<void> {
    await this.requestMetadata.create(buildRequestMetadata(request, transactionId));
  }
}

export function buildRequestMetadata(
  request: HttpRequestInfo,
  transactionId: number | null,
): NewRequestMetadata {
  const userAgent = headerValue(request, 'user-agent') ?? '';

  return {
    transaction_id: transactionId,
    ip_address: request.ip,
    user_agent: userAgent === '' ? null : userAgent,
    referer: headerValue(request, 'referer'),
    device_type: detectDeviceType(userAgent),
    browser: detectBrowser(userAgent),
    os: detectOperatingSystem(userAgent),
    device_fingerprint: deviceFingerprint(request, userAgent),
    is_vpn: false,
    is_proxy: false,
    is_mobile: isMobileDevice(userAgent),
    risk_score: 0,
    risk_reason: null,
    custom_metadata: {
      method: request.method,
      path: request.path,
      query: redactSensitiveData(request.query),
      payload: redactSensitiveData(request.body),
      headers: redactSensitiveData(request.headers),
    },
  };
}

export function redactSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      redacted[key] = '[redacted]';
      continue;
    }

    redacted[key] = isPlainRecord(value) ? redactSensitiveData(value) : value;
  }

  return redacted;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();

  return SENSITIVE_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deviceFingerprint(request: HttpRequestInfo, userAgent: string): string {
  const components = [
    request.ip,
    userAgent,
    headerValue(request, 'accept-language') ?? '',
    headerValue(request, 'accept-encoding') ?? '',
  ];

  return createHash('sha256').update(components.join('|'), 'utf8').digest('hex');
}
