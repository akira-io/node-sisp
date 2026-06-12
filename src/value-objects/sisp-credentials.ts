export interface SispCredentials {
  posId: string;
  posAutCode: string;
  currency: string;
  merchantId: string;
  url: string;
  languageMessages: string;
  fingerprintVersion: string;
  is3DSec: string;
  sandbox: boolean;
  urlMerchantResponse: string | null;
}

export function sispCredentials(data: Partial<SispCredentials>): SispCredentials {
  return {
    posId: data.posId ?? '',
    posAutCode: data.posAutCode ?? '',
    currency: data.currency ?? '132',
    merchantId: data.merchantId ?? '',
    url: data.url ?? '',
    languageMessages: data.languageMessages ?? 'EN',
    fingerprintVersion: data.fingerprintVersion ?? '1',
    is3DSec: data.is3DSec ?? '0',
    sandbox: data.sandbox ?? false,
    urlMerchantResponse: data.urlMerchantResponse ?? null,
  };
}
