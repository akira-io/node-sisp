import type { CallbackPipe, PaymentPipe } from '../core/contracts/pipes';
import type { SispStorage } from '../core/contracts/storage';
import {
  type PaymentValidationConfig,
  resolvePaymentValidation,
} from '../domain/policies/payment-validation';
import { type SispCredentials, sispCredentials } from '../domain/value-objects/sisp-credentials';
import {
  generateMerchantReference,
  generateMerchantSession,
  generateTimeStamp,
} from '../support/generators';
import { booleanSetting } from '../support/settings';
import type { EventErrorHandler } from './events';
import {
  type DeepPartial,
  type RateLimiting,
  type RateLimitRule,
  resolveRateLimiting,
} from './rate-limiting';

export interface SispPipelineCustomizers {
  payment?: (defaults: PaymentPipe[]) => PaymentPipe[];
  callback?: (defaults: CallbackPipe[]) => CallbackPipe[];
}

export interface SispTables {
  transactions: string;
  transactionItems: string;
  transactionAttempts: string;
  paymentIntents: string;
  invoices: string;
  requestMetadata: string;
  rateLimits: string;
  blacklist: string;
  transactionLogs: string;
}

export interface SispGenerators {
  merchantReference: () => string;
  merchantSession: () => string;
  timeStamp: () => string;
}

export interface IdentifierGenerationConfig {
  maxAttempts: number;
  collisionRetrySleepMs: number;
}

export interface RetryConfig {
  maxAttempts: number;
}

export interface IdempotencyConfig {
  enabled: boolean;
  requestKeys: string[];
}

export interface SecuritySettings {
  collectMetadata: boolean;
}

export interface TransactionStatusConfig {
  url: string;
  portalId: string;
  portalPassword: string;
  timeoutSeconds: number;
  retryAttempts: number;
  retryDelayMs: number;
  reconciliationEnabled: boolean;
  reconcileAfterMinutes: number;
  reconcileLimit: number;
}

export type SispDatabaseConnection =
  | string
  | Record<string, unknown>
  | (() => Record<string, unknown> | Promise<Record<string, unknown>>);
export interface SispDatabaseConfig {
  client: 'better-sqlite3' | 'pg' | 'mysql2';
  connection: SispDatabaseConnection;
  autoMigrate?: boolean;
}

export interface SispConfig {
  posId: string;
  posAutCode: string;
  storage?: SispStorage;
  database?: SispDatabaseConfig;
  url?: string;
  driver?: string;
  sandbox?: boolean;
  currency?: string;
  languageMessages?: string;
  fingerprintVersion?: string;
  is3DSec?: '0' | '1';
  transactionCode?: string;
  urlMerchantResponse?: string;
  redirectUrl?: string;
  frontendResultUrl?: string;
  appKey?: string;
  baseUrl?: string;
  basePath?: string;
  allowRetry?: boolean;
  tables?: Partial<SispTables>;
  rateLimiting?: DeepPartial<RateLimiting>;
  security?: Partial<SecuritySettings>;
  generators?: Partial<SispGenerators>;
  identifierGeneration?: Partial<IdentifierGenerationConfig>;
  retry?: Partial<RetryConfig>;
  idempotency?: Partial<IdempotencyConfig>;
  paymentValidation?: Partial<PaymentValidationConfig>;
  pipelines?: SispPipelineCustomizers;
  onEventListenerError?: EventErrorHandler;
  transactionStatus?: Partial<TransactionStatusConfig>;
}

export interface ResolvedSharedConfig {
  posId: string;
  posAutCode: string;
  url: string;
  driver: string | null;
  sandbox: boolean;
  currency: string;
  languageMessages: string;
  fingerprintVersion: string;
  is3DSec: string;
  transactionCode: string;
  urlMerchantResponse: string | null;
  redirectUrl: string;
  frontendResultUrl: string | null;
  appKey: string | null;
  baseUrl: string;
  basePath: string;
  generators: SispGenerators;
  paymentValidation: PaymentValidationConfig;
  onEventListenerError: EventErrorHandler | null;
  transactionStatus: TransactionStatusConfig;
}

export interface ResolvedSispConfig extends ResolvedSharedConfig {
  database: Required<SispDatabaseConfig> | undefined;
  allowRetry: boolean;
  tables: SispTables;
  rateLimiting: RateLimiting;
  security: SecuritySettings;
  identifierGeneration: IdentifierGenerationConfig;
  retry: RetryConfig;
  idempotency: IdempotencyConfig;
  pipelines: SispPipelineCustomizers;
}

export const DEFAULT_TABLES: SispTables = {
  transactions: 'sisp_transactions',
  transactionItems: 'sisp_transaction_items',
  transactionAttempts: 'sisp_transaction_attempts',
  paymentIntents: 'sisp_payment_intents',
  invoices: 'sisp_invoices',
  requestMetadata: 'sisp_request_metadata',
  rateLimits: 'sisp_rate_limits',
  blacklist: 'sisp_blacklist',
  transactionLogs: 'sisp_transaction_logs',
};
export const DEFAULT_TRANSACTION_STATUS: TransactionStatusConfig = {
  url: 'https://comerciante.vinti4.cv/pos/transaction-status',
  portalId: '',
  portalPassword: '',
  timeoutSeconds: 10,
  retryAttempts: 2,
  retryDelayMs: 100,
  reconciliationEnabled: false,
  reconcileAfterMinutes: 5,
  reconcileLimit: 50,
};
const DEFAULT_IDENTIFIER_GENERATION: IdentifierGenerationConfig = {
  maxAttempts: 5,
  collisionRetrySleepMs: 1000,
};

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3 };

const DEFAULT_IDEMPOTENCY: IdempotencyConfig = {
  enabled: true,
  requestKeys: ['idempotency_key', 'checkout_intent_id'],
};

export function resolveConfig(config: SispConfig): ResolvedSispConfig {
  const hasStorage = config.storage != null;
  const hasDatabase = config.database != null;

  if (hasStorage && hasDatabase) {
    throw new Error('Provide either `storage` or `database`, not both.');
  }

  if (!hasStorage && !hasDatabase) {
    throw new Error('Either `storage` or `database` must be provided.');
  }

  const sandbox = booleanSetting(config.sandbox, false);

  const database =
    config.database != null
      ? {
          client: config.database.client,
          connection: config.database.connection,
          autoMigrate: booleanSetting(config.database.autoMigrate, sandbox),
        }
      : undefined;

  return {
    posId: config.posId,
    posAutCode: config.posAutCode,
    database,
    url: config.url ?? '',
    driver: config.driver ?? null,
    sandbox,
    currency: config.currency ?? '132',
    languageMessages: config.languageMessages ?? 'EN',
    fingerprintVersion: config.fingerprintVersion ?? '1',
    is3DSec: config.is3DSec ?? '0',
    transactionCode: config.transactionCode ?? '1',
    urlMerchantResponse: config.urlMerchantResponse ?? null,
    redirectUrl: config.redirectUrl ?? '/',
    frontendResultUrl: config.frontendResultUrl ?? null,
    appKey: config.appKey ?? null,
    baseUrl: config.baseUrl ?? '',
    basePath: config.basePath ?? '/sisp',
    allowRetry: booleanSetting(config.allowRetry, true),
    tables: { ...DEFAULT_TABLES, ...config.tables },
    rateLimiting: resolveRateLimiting(config.rateLimiting),
    security: { collectMetadata: booleanSetting(config.security?.collectMetadata, true) },
    generators: {
      merchantReference:
        config.generators?.merchantReference ?? (() => generateMerchantReference()),
      merchantSession: config.generators?.merchantSession ?? (() => generateMerchantSession()),
      timeStamp: config.generators?.timeStamp ?? (() => generateTimeStamp()),
    },
    identifierGeneration: {
      ...DEFAULT_IDENTIFIER_GENERATION,
      ...config.identifierGeneration,
    },
    retry: { ...DEFAULT_RETRY, ...config.retry },
    idempotency: {
      ...DEFAULT_IDEMPOTENCY,
      ...config.idempotency,
    },
    paymentValidation: resolvePaymentValidation(config.paymentValidation, config.currency ?? '132'),
    pipelines: config.pipelines ?? {},
    onEventListenerError: config.onEventListenerError ?? null,
    transactionStatus: { ...DEFAULT_TRANSACTION_STATUS, ...config.transactionStatus },
  };
}

export function credentialsFromConfig(config: ResolvedSharedConfig): SispCredentials {
  return sispCredentials({
    posId: config.posId,
    posAutCode: config.posAutCode,
    currency: config.currency,
    url: config.url,
    languageMessages: config.languageMessages,
    fingerprintVersion: config.fingerprintVersion,
    is3DSec: config.is3DSec,
    sandbox: config.sandbox,
    urlMerchantResponse: config.urlMerchantResponse,
  });
}

export function routeUrl(config: ResolvedSharedConfig, route: string): string {
  return `${config.baseUrl}${config.basePath}/${route}`;
}

export type { DeepPartial, RateLimiting, RateLimitRule };
