import { countryToNumeric } from '../support/country-code-mapper';

export interface ThreeDSecureCustomer {
  email: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
  phone?: string | null;
}

export function buildPurchaseRequest(
  customer: ThreeDSecureCustomer,
  now: Date = new Date(),
): string {
  const payload = {
    acctID: 'x',
    acctInfo: buildAcctInfo(now),
    email: customer.email,
    addrMatch: 'N',
    billAddrCity: customer.city,
    billAddrCountry: countryToNumeric(customer.country),
    billAddrLine1: customer.address,
    billAddrLine2: '',
    billAddrLine3: '',
    billAddrPostCode: customer.postalCode,
    billAddrState: '',
    shipAddrCity: 'City',
    shipAddrCountry: '132',
    shipAddrLine1: '000',
    shipAddrPostCode: '000',
    shipAddrState: '',
    workPhone: { cc: '238', subscriber: '0000000' },
    mobilePhone: { cc: '238', subscriber: customer.phone ?? '0000000' },
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function buildAcctInfo(now: Date): Record<string, string> {
  const date = compactDate(now);

  return {
    chAccAgeInd: '05',
    chAccChange: date,
    chAccDate: date,
    chAccPwChange: date,
    chAccPwChangeInd: '05',
    suspiciousAccActivity: '01',
  };
}

function compactDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}${month}${day}`;
}
