import type { ResolvedSispConfig } from '../../application/config';
import type { CredentialsResolver } from '../../core/contracts/credentials-resolver';
import type { SispDriver } from '../../core/contracts/sisp-driver';
import { ProductionDriver } from './production-driver';
import { SandboxDriver } from './sandbox-driver';
import { TransactionStatusClient } from './transaction-status-client';

export type DriverFactory = () => SispDriver;

export class SispManager {
  private readonly factories = new Map<string, DriverFactory>();
  private readonly resolved = new Map<string, SispDriver>();

  constructor(private readonly defaultDriverName: () => string) {}

  driver(name?: string | null): SispDriver {
    const driverName = name ?? this.defaultDriverName();
    const cached = this.resolved.get(driverName);

    if (cached) {
      return cached;
    }

    const factory = this.factories.get(driverName);

    if (!factory) {
      throw new Error(`SISP driver [${driverName}] is not registered.`);
    }

    const driver = factory();

    this.resolved.set(driverName, driver);

    return driver;
  }

  extend(name: string, factory: DriverFactory): this {
    this.factories.set(name, factory);
    this.resolved.delete(name);

    return this;
  }
}

export function createSispManager(
  config: ResolvedSispConfig,
  credentialsResolver: CredentialsResolver,
  statusClient: TransactionStatusClient = new TransactionStatusClient(config, credentialsResolver),
): SispManager {
  const manager = new SispManager(() => defaultDriverName(config, credentialsResolver));

  manager.extend('production', () => new ProductionDriver(credentialsResolver, statusClient));
  manager.extend('sandbox', () => new SandboxDriver(config, statusClient));

  return manager;
}

function defaultDriverName(
  config: ResolvedSispConfig,
  credentialsResolver: CredentialsResolver,
): string {
  if (config.driver !== null && config.driver !== '') {
    return config.driver;
  }

  return credentialsResolver.resolve().sandbox ? 'sandbox' : 'production';
}
