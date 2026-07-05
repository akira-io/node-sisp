import { findCountryByAlpha2 } from './countries';

export function countryToNumeric(alpha2Code: string): string | null {
  return findCountryByAlpha2(alpha2Code)?.numeric ?? null;
}
