import { type ResolvedSispConfig, routeUrl } from '../config';
import type { SispDriver } from '../contracts/sisp-driver';
import type { TransactionStatusResponse } from '../value-objects/transaction-status-response';
import type { TransactionStatusClient } from './transaction-status-client';

export class SandboxDriver implements SispDriver {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly statusClient: TransactionStatusClient,
  ) {}

  name(): string {
    return 'sandbox';
  }

  paymentEndpoint(): string {
    return routeUrl(this.config, 'sandbox');
  }

  async queryTransactionStatus(merchantRef: string): Promise<TransactionStatusResponse> {
    return this.statusClient.query(merchantRef);
  }
}
