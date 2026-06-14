import type { SispCredentials } from '../value-objects/sisp-credentials';

export interface CredentialsResolver {
  resolve(): SispCredentials;
}

export class StaticCredentialsResolver implements CredentialsResolver {
  constructor(private readonly credentials: SispCredentials) {}

  resolve(): SispCredentials {
    return this.credentials;
  }
}
