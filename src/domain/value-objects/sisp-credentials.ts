export interface SispTransactionStatusCredentials {
  readonly url: string;
  readonly portalId: string;
  readonly portalPassword: string;
  readonly timeoutSeconds: number;
}

export interface SispCredentials {
  readonly posId: string;
  readonly posAutCode: string;
  readonly currency: string;
  readonly url: string;
  readonly languageMessages: string;
  readonly fingerprintVersion: string;
  readonly is3DSec: string;
  readonly sandbox: boolean;
  readonly urlMerchantResponse: string | null;
  readonly transactionStatus?: Readonly<Partial<SispTransactionStatusCredentials>>;
}

export function sispCredentials(data: Partial<SispCredentials>): SispCredentials {
  return Object.freeze({
    posId: data.posId ?? '',
    posAutCode: data.posAutCode ?? '',
    currency: data.currency ?? '132',
    url: data.url ?? '',
    languageMessages: data.languageMessages ?? 'EN',
    fingerprintVersion: data.fingerprintVersion ?? '1',
    is3DSec: data.is3DSec ?? '0',
    sandbox: data.sandbox ?? false,
    urlMerchantResponse: data.urlMerchantResponse ?? null,
    transactionStatus:
      data.transactionStatus === undefined
        ? undefined
        : Object.freeze({ ...data.transactionStatus }),
  });
}
