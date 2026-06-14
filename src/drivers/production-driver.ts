import type { CredentialsResolver } from '../contracts/credentials-resolver';
import type { SispDriver } from '../contracts/sisp-driver';
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
    return this.credentialsResolver.resolve().url;
  }

  async queryTransactionStatus(merchantRef: string): Promise<TransactionStatusResponse> {
    return this.statusClient.query(merchantRef);
  }
}
