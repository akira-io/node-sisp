import type { SispManager } from '../drivers/sisp-manager';

export function buildGatewayFormAction(
  manager: SispManager,
  fields: Record<string, string | number>,
): string {
  const endpoint = manager.driver().paymentEndpoint();
  const extras = new URLSearchParams({
    FingerPrint: String(fields.fingerprint ?? ''),
    TimeStamp: String(fields.timeStamp ?? ''),
    FingerPrintVersion: String(fields.fingerprintversion ?? ''),
  });

  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${extras.toString()}`;
}
