import type { CredentialsResolver } from '../../core/contracts/credentials-resolver';
import type { SispDriver } from '../../core/contracts/sisp-driver';
import { SispError } from '../../domain/errors/exceptions';
import type { TransactionStatusResponse } from '../../domain/value-objects/transaction-status-response';
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
