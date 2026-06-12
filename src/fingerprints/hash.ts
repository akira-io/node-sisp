import { createHash, timingSafeEqual } from 'node:crypto';

export function sha512Base64(content: string): string {
  return createHash('sha512').update(content, 'utf8').digest('base64');
}

export function constantTimeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
