import { sha512Base64 } from './hash';

export function computeToken(posAutCode: string): string {
  return sha512Base64(posAutCode);
}
