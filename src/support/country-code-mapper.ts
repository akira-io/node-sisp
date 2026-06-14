const ALPHA2_TO_NUMERIC: Record<string, string> = {
  CV: '132',
  PT: '620',
  BR: '076',
  ES: '724',
  FR: '250',
  DE: '276',
  GB: '826',
  US: '840',
  AO: '024',
  MZ: '508',
  ST: '678',
  GW: '624',
  NL: '528',
  IT: '380',
  LU: '442',
  CH: '756',
  BE: '056',
  SN: '686',
};

export function countryToNumeric(alpha2Code: string): string {
  return ALPHA2_TO_NUMERIC[alpha2Code.toUpperCase()] ?? '132';
}
