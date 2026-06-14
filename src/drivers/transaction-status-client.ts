import type { ResolvedSispConfig } from '../config';
import type { CredentialsResolver } from '../contracts/credentials-resolver';
import { SispError } from '../exceptions';
import {
  type TransactionStatusResponse,
  transactionStatusResponseFrom,
} from '../value-objects/transaction-status-response';

export class TransactionStatusClient {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly credentialsResolver: CredentialsResolver,
  ) {}

  async query(merchantRef: string): Promise<TransactionStatusResponse> {
    const { url, portalId, portalPassword, timeoutSeconds } = this.config.transactionStatus;

    if (portalId === '' || portalPassword === '') {
      throw new SispError('SISP transaction status portal credentials are not configured.');
    }

    const credentials = this.credentialsResolver.resolve();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${portalId}:${portalPassword}`, 'utf8').toString('base64')}`,
      },
      body: JSON.stringify({
        posID: credentials.posId,
        posAuthCode: credentials.posAutCode,
        merchantRef,
      }),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });

    if (!response.ok) {
      return transactionStatusResponseFrom({
        result: false,
        transactionSuccess: false,
        transactionStatusDescription: '',
        msg: `SISP transaction status request failed with HTTP ${response.status}.`,
      });
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> | null;

    return transactionStatusResponseFrom(body ?? {});
  }
}
