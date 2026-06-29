import { randomBytes } from 'node:crypto';

export const MERCHANT_IDENTIFIER_MAX_LENGTH = 15;

const IDENTIFIER_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function generateMerchantReference(date: Date = new Date()): string {
  return buildMerchantIdentifier('R', date);
}

export function generateMerchantSession(date: Date = new Date()): string {
  return buildMerchantIdentifier('S', date);
}

export function generateTimeStamp(date: Date = new Date()): string {
  return formatSispTimestamp(date);
}

export function formatSispTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function buildMerchantIdentifier(prefix: string, date: Date): string {
  const time = Math.floor(date.getTime()).toString(36);
  const randomLength = Math.max(2, MERCHANT_IDENTIFIER_MAX_LENGTH - prefix.length - time.length);

  return `${prefix}${time}${randomAlphanumeric(randomLength)}`.slice(
    0,
    MERCHANT_IDENTIFIER_MAX_LENGTH,
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function randomAlphanumeric(length: number): string {
  const bytes = randomBytes(length);
  let identifier = '';

  for (let index = 0; index < length; index += 1) {
    identifier += IDENTIFIER_ALPHABET[(bytes[index] ?? 0) % IDENTIFIER_ALPHABET.length];
  }

  return identifier;
}
