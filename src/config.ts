import type { Knex } from 'knex';
import type { CallbackPipe, PaymentPipe } from './contracts/pipes';
import type { EventErrorHandler } from './events';
import { type PaymentValidationConfig, resolvePaymentValidation } from './payment-validation';
import {
  generateMerchantReference,
  generateMerchantSession,
  generateTimeStamp,
} from './support/generators';
import { type SispCredentials, sispCredentials } from './value-objects/sisp-credentials';

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

export interface RateLimitRule {
  enabled: boolean;
  limit: number;
  windowSeconds: number;
}

export interface RateLimiting {
  enabled: boolean;
  perIp: RateLimitRule;
  perMerchant: RateLimitRule;
  perUser: RateLimitRule;
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

export interface SispDatabaseConfig {
  client: 'better-sqlite3' | 'pg' | 'mysql2';
  connection: Knex.Config['connection'];
  autoMigrate?: boolean;
}

export interface SispConfig {
  posId: string;
  posAutCode: string;
  database: SispDatabaseConfig;
  url?: string;
  merchantId?: string;
  driver?: string;
  sandbox?: boolean;
  currency?: string;
  languageMessages?: string;
  fingerprintVersion?: string;
  is3DSec?: '0' | '1';
  transactionCode?: string;
  urlMerchantResponse?: string;
  redirectUrl?: string;
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

export interface ResolvedSispConfig {
  posId: string;
  posAutCode: string;
  database: Required<SispDatabaseConfig>;
  url: string;
  merchantId: string;
  driver: string | null;
  sandbox: boolean;
  currency: string;
  languageMessages: string;
  fingerprintVersion: string;
  is3DSec: string;
  transactionCode: string;
  urlMerchantResponse: string | null;
  redirectUrl: string;
  appKey: string | null;
  baseUrl: string;
  basePath: string;
  allowRetry: boolean;
  tables: SispTables;
  rateLimiting: RateLimiting;
  security: SecuritySettings;
  generators: SispGenerators;
  identifierGeneration: IdentifierGenerationConfig;
  retry: RetryConfig;
  idempotency: IdempotencyConfig;
  paymentValidation: PaymentValidationConfig;
  pipelines: SispPipelineCustomizers;
  onEventListenerError: EventErrorHandler | null;
  transactionStatus: TransactionStatusConfig;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
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
const DEFAULT_TRANSACTION_STATUS: TransactionStatusConfig = {
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
const DEFAULT_RATE_LIMITING: RateLimiting = {
  enabled: true,
  perIp: { enabled: true, limit: 100, windowSeconds: 3600 },
  perMerchant: { enabled: true, limit: 500, windowSeconds: 3600 },
  perUser: { enabled: true, limit: 50, windowSeconds: 3600 },
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
  const sandbox = booleanSetting(config.sandbox, false);

  return {
    posId: config.posId,
    posAutCode: config.posAutCode,
    database: {
      client: config.database.client,
      connection: config.database.connection,
      autoMigrate: booleanSetting(config.database.autoMigrate, sandbox),
    },
    url: config.url ?? '',
    merchantId: config.merchantId ?? '',
    driver: config.driver ?? null,
    sandbox,
    currency: config.currency ?? '132',
    languageMessages: config.languageMessages ?? 'EN',
    fingerprintVersion: config.fingerprintVersion ?? '1',
    is3DSec: config.is3DSec ?? '0',
    transactionCode: config.transactionCode ?? '1',
    urlMerchantResponse: config.urlMerchantResponse ?? null,
    redirectUrl: config.redirectUrl ?? '/',
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

export function credentialsFromConfig(config: ResolvedSispConfig): SispCredentials {
  return sispCredentials({
    posId: config.posId,
    posAutCode: config.posAutCode,
    currency: config.currency,
    merchantId: config.merchantId,
    url: config.url,
    languageMessages: config.languageMessages,
    fingerprintVersion: config.fingerprintVersion,
    is3DSec: config.is3DSec,
    sandbox: config.sandbox,
    urlMerchantResponse: config.urlMerchantResponse,
  });
}

export function routeUrl(config: ResolvedSispConfig, route: string): string {
  return `${config.baseUrl}${config.basePath}/${route}`;
}

function resolveRateLimiting(overrides: DeepPartial<RateLimiting> | undefined): RateLimiting {
  return {
    enabled: booleanSetting(overrides?.enabled, DEFAULT_RATE_LIMITING.enabled),
    perIp: resolveRateLimitRule(DEFAULT_RATE_LIMITING.perIp, overrides?.perIp),
    perMerchant: resolveRateLimitRule(DEFAULT_RATE_LIMITING.perMerchant, overrides?.perMerchant),
    perUser: resolveRateLimitRule(DEFAULT_RATE_LIMITING.perUser, overrides?.perUser),
  };
}

function resolveRateLimitRule(
  defaults: RateLimitRule,
  overrides: Partial<RateLimitRule> | undefined,
): RateLimitRule {
  return {
    enabled: booleanSetting(overrides?.enabled, defaults.enabled),
    limit: overrides?.limit ?? defaults.limit,
    windowSeconds: overrides?.windowSeconds ?? defaults.windowSeconds,
  };
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}
