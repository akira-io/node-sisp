import type { ResolvedSispConfig } from '../config';
import type { CredentialsResolver } from '../contracts/credentials-resolver';
import { SispError, TransactionStatusTransportError } from '../exceptions';
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
    const credentials = this.credentialsResolver.resolve();
    const settings = {
      ...this.config.transactionStatus,
      ...credentials.transactionStatus,
    };
    const { url, portalId, portalPassword, timeoutSeconds, retryAttempts, retryDelayMs } = settings;

    if (portalId === '' || portalPassword === '') {
      throw new SispError('SISP transaction status portal credentials are not configured.');
    }

    return this.withRetries(
      () =>
        this.queryOnce(url, portalId, portalPassword, timeoutSeconds, merchantRef, {
          posID: credentials.posId,
          posAuthCode: credentials.posAutCode,
        }),
      retryAttempts,
      retryDelayMs,
    );
  }

  private async queryOnce(
    url: string,
    portalId: string,
    portalPassword: string,
    timeoutSeconds: number,
    merchantRef: string,
    body: { posID: string; posAuthCode: string },
  ): Promise<TransactionStatusResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${portalId}:${portalPassword}`, 'utf8').toString('base64')}`,
      },
      body: JSON.stringify({ ...body, merchantRef }),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new TransactionStatusTransportError(
        `SISP transaction status request failed with HTTP ${response.status}.`,
        response.status >= 500,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> | null;

    return transactionStatusResponseFrom(payload ?? {});
  }

  private async withRetries<T>(
    operation: () => Promise<T>,
    retryAttempts: number,
    retryDelayMs: number,
  ): Promise<T> {
    const maxAttempts = Math.max(1, Math.floor(retryAttempts));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = toTransportError(error);

        if (!shouldRetry(lastError) || attempt >= maxAttempts) {
          throw lastError;
        }

        await sleep(retryDelayMs);
      }
    }

    throw toTransportError(lastError);
  }
}

function shouldRetry(error: unknown): boolean {
  return !(error instanceof TransactionStatusTransportError) || error.retryable;
}

function toTransportError(error: unknown): TransactionStatusTransportError {
  if (error instanceof TransactionStatusTransportError) {
    return error;
  }

  if (error instanceof Error && error.name.toLowerCase().includes('timeout')) {
    return new TransactionStatusTransportError('SISP transaction status request timed out.');
  }

  const message = error instanceof Error ? error.message : String(error);

  return new TransactionStatusTransportError(`SISP transaction status request failed: ${message}.`);
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
