import type { CredentialsResolver } from '../contracts/credentials-resolver';
import type { SispDriver } from '../contracts/sisp-driver';
import { SispError } from '../exceptions';
import type { TransactionStatusResponse } from '../value-objects/transaction-status-response';
import type { TransactionStatusClient } from './transaction-status-client';

export class ProductionDriver implements SispDriver {
  constructor(
    private readonly credentialsResolver: CredentialsResolver,
    private readonly statusClient: TransactionStatusClient,
  ) {}

  name(): string {
    return 'production';
  }

  paymentEndpoint(): string {
    const endpoint = this.credentialsResolver.resolve().url.trim();

    if (!isHttpsUrl(endpoint)) {
      throw new SispError('SISP production payment URL must be an absolute HTTPS URL.');
    }

    return endpoint;
  }

  async queryTransactionStatus(merchantRef: string): Promise<TransactionStatusResponse> {
    return this.statusClient.query(merchantRef);
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.host !== '';
  } catch {
    return false;
  }
}
