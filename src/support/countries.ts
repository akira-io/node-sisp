import { COUNTRIES } from './countries.generated';

export interface Country {
  alpha2: string;
  numeric: string;
  name: string;
  flag: string;
}

export function allCountries(): Record<string, Country> {
  return COUNTRIES;
}

export function getCountryNumericCode(alpha2: string): string {
  return findCountryByAlpha2(alpha2)?.numeric ?? '132';
}

export function getCountryFlag(alpha2: string): string {
  return findCountryByAlpha2(alpha2)?.flag ?? 'https://flagcdn.com/xx.svg';
}

export function getCountryName(alpha2: string): string | null {
  return findCountryByAlpha2(alpha2)?.name ?? null;
}

export function findCountryByNumeric(numericCode: string): Country | null {
  return Object.values(COUNTRIES).find((country) => country.numeric === numericCode) ?? null;
}

export function findCountryByAlpha2(alpha2: string): Country | null {
  return (COUNTRIES as Record<string, Country>)[alpha2.toLowerCase()] ?? null;
}
