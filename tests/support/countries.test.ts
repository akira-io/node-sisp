import { describe, expect, it } from 'vitest';
import {
  allCountries,
  findCountryByNumeric,
  getCountryFlag,
  getCountryName,
  getCountryNumericCode,
} from '../../src/support/countries';

describe('countries', () => {
  it('ports the full SISP country catalog', () => {
    expect(Object.keys(allCountries())).toHaveLength(248);
  });

  it('resolves numeric codes with Cabo Verde as the fallback', () => {
    expect(getCountryNumericCode('CV')).toBe('132');
    expect(getCountryNumericCode('pt')).toBe('620');
    expect(getCountryNumericCode('zz')).toBe('132');
  });

  it('resolves flags and names', () => {
    expect(getCountryFlag('cv')).toBe('https://flagcdn.com/cv.svg');
    expect(getCountryFlag('zz')).toBe('https://flagcdn.com/xx.svg');
    expect(getCountryName('CV')).toBe('Cabo Verde');
    expect(getCountryName('zz')).toBeNull();
  });

  it('finds countries by numeric code', () => {
    expect(findCountryByNumeric('620')?.alpha2).toBe('PT');
    expect(findCountryByNumeric('000')).toBeNull();
  });
});
