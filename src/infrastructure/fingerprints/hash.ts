import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COMPARE_KEY = Buffer.from('sisp-constant-time-compare');

export function sha512Base64(content: string): string {
  return createHash('sha512').update(content, 'utf8').digest('base64');
}

export function constantTimeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = compareDigest(expected);
  const actualBuffer = compareDigest(actual);

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function compareDigest(value: string): Buffer {
  return createHmac('sha256', COMPARE_KEY).update(value, 'utf8').digest();
}
