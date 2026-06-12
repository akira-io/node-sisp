import { toThousandths } from '../support/sisp-amount';
import { sha512Base64 } from './hash';

export interface RefundFingerprintData {
  amount?: number | string;
  timeStamp?: string | number;
  merchantRef?: string | number;
  merchantSession?: string | number;
  posID?: string | number;
  currency?: string | number;
  transactionCode?: string | number;
  clearingPeriod?: string | number;
  transactionID?: string | number;
}

export function generateRefundFingerprint(token: string, data: RefundFingerprintData): string {
  const fields = [
    token,
    trimmed(data.timeStamp),
    String(toThousandths(data.amount ?? 0)),
    trimmed(data.merchantRef),
    trimmed(data.merchantSession),
    trimmed(data.posID),
    trimmed(data.currency),
    trimmed(data.transactionCode),
    trimmed(data.clearingPeriod).padStart(4, '0'),
    trimmed(data.transactionID).padStart(8, '0'),
  ];

  return sha512Base64(fields.join(''));
}

function trimmed(value: string | number | undefined): string {
  return value === undefined ? '' : String(value).trim();
}
