import type { ResolvedSispConfig } from '../config';
import type { CredentialsResolver } from '../contracts/credentials-resolver';
import type { TransactionRecord } from '../database/records';
import { RefundTransactionCode } from '../enums/transaction-code';
import { SispError } from '../exceptions';
import { generateRefundFingerprint } from '../fingerprints/refund-fingerprint';
import { computeToken } from '../fingerprints/token';
import type { RefundRequest } from '../value-objects/refund-request';

export class BuildRefundRequestAction {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly credentialsResolver: CredentialsResolver,
  ) {}

  total(transaction: TransactionRecord): RefundRequest {
    return this.handle(transaction, transaction.amount, RefundTransactionCode.TotalReversal);
  }

  partial(transaction: TransactionRecord, amount: number): RefundRequest {
    return this.handle(transaction, amount, RefundTransactionCode.PartialReversal);
  }

  history(transaction: TransactionRecord): RefundRequest {
    return this.handle(transaction, 0, RefundTransactionCode.History);
  }

  handle(transaction: TransactionRecord, amount: number, transactionCode: string): RefundRequest {
    const credentials = this.credentialsResolver.resolve();
    const clearingPeriod = requiredField(transaction.response_code, 'clearingPeriod');
    const transactionID = requiredField(transaction.transaction_id, 'transactionID');

    const request: Omit<RefundRequest, 'fingerprint'> = {
      posID: credentials.posId,
      merchantRef: requiredField(transaction.merchant_ref, 'merchantRef'),
      merchantSession: requiredField(transaction.merchant_session, 'merchantSession'),
      amount,
      currency: requiredField(transaction.currency, 'currency'),
      timeStamp: this.config.generators.timeStamp(),
      fingerprintversion: '2',
      transactionCode,
      reversal: RefundTransactionCode.Reversal,
      clearingPeriod,
      transactionID,
    };

    const fingerprint = generateRefundFingerprint(computeToken(credentials.posAutCode), {
      amount: request.amount,
      timeStamp: request.timeStamp,
      merchantRef: request.merchantRef,
      merchantSession: request.merchantSession,
      posID: request.posID,
      currency: request.currency,
      transactionCode: request.transactionCode,
      clearingPeriod: request.clearingPeriod,
      transactionID: request.transactionID,
    });

    return { ...request, fingerprint };
  }
}

function requiredField(value: string | number | null, field: string): string {
  const text = value === null ? '' : String(value).trim();

  if (text === '') {
    throw new SispError(`SISP refund requires original ${field}.`);
  }

  return text;
}
