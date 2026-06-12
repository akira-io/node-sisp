import type { CredentialsResolver } from '../contracts/credentials-resolver';
import type { SispDriver } from '../contracts/sisp-driver';

export class ProductionDriver implements SispDriver {
  constructor(private readonly credentialsResolver: CredentialsResolver) {}

  name(): string {
    return 'production';
  }

  paymentEndpoint(): string {
    return this.credentialsResolver.resolve().url;
  }
}
