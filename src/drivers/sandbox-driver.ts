import { type ResolvedSispConfig, routeUrl } from '../config';
import type { SispDriver } from '../contracts/sisp-driver';

export class SandboxDriver implements SispDriver {
  constructor(private readonly config: ResolvedSispConfig) {}

  name(): string {
    return 'sandbox';
  }

  paymentEndpoint(): string {
    return routeUrl(this.config, 'sandbox');
  }
}
