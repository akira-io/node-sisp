import { toThousandths } from '../support/sisp-amount';
import { sha512Base64 } from './hash';

export interface PaymentFingerprintData {
  amount: number | string;
  timeStamp?: string;
  merchantRef?: string;
  merchantSession?: string;
  posID?: string;
  currency?: string;
  transactionCode?: string;
}

export function generatePaymentFingerprint(token: string, data: PaymentFingerprintData): string {
  const content =
    token +
    (data.timeStamp ?? '') +
    String(toThousandths(data.amount)) +
    (data.merchantRef ?? '') +
    (data.merchantSession ?? '') +
    (data.posID ?? '') +
    (data.currency ?? '') +
    (data.transactionCode ?? '');

  return sha512Base64(content);
}
