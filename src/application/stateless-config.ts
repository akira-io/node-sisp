import type {
  ExpectedPaymentResolver,
  PaymentCorrelationStore,
} from '../core/contracts/payment-correlation-store';
import {
  type PaymentValidationConfig,
  resolvePaymentValidation,
} from '../domain/policies/payment-validation';
import {
  generateMerchantReference,
  generateMerchantSession,
  generateTimeStamp,
} from '../support/generators';
import { booleanSetting } from '../support/settings';
import type { ResolvedSharedConfig, SispGenerators, TransactionStatusConfig } from './config';
import { DEFAULT_TRANSACTION_STATUS } from './config';
import { assertSafeEnvironment } from './environment-guards';
import type { EventErrorHandler } from './events';
import type { StatelessCallbackPipe } from './pipelines/callback/stateless/stateless-callback-pipeline';

export interface StatelessPipelineCustomizers {
  callback?: (defaults: StatelessCallbackPipe[]) => StatelessCallbackPipe[];
}

export interface StatelessSispConfig {
  posId: string;
  posAutCode: string;
  correlation?: PaymentCorrelationStore;
  expectedPayment?: ExpectedPaymentResolver;
  url?: string;
  driver?: string;
  sandbox?: boolean;
  allowSandboxInProduction?: boolean;
  allowWeakAppKey?: boolean;
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
  generators?: Partial<SispGenerators>;
  paymentValidation?: Partial<PaymentValidationConfig>;
  pipelines?: StatelessPipelineCustomizers;
  onEventListenerError?: EventErrorHandler;
  transactionStatus?: Partial<TransactionStatusConfig>;
}

export interface ResolvedStatelessConfig extends ResolvedSharedConfig {
  correlation: PaymentCorrelationStore | null;
  expectedPayment: ExpectedPaymentResolver | null;
  pipelines: StatelessPipelineCustomizers;
}

export function resolveStatelessConfig(config: StatelessSispConfig): ResolvedStatelessConfig {
  const sandbox = booleanSetting(config.sandbox, false);
  const appKey = config.appKey ?? null;

  assertSafeEnvironment(
    sandbox || config.driver === 'sandbox',
    booleanSetting(config.allowSandboxInProduction, false),
    appKey,
    booleanSetting(config.allowWeakAppKey, false),
  );

  return {
    posId: config.posId,
    posAutCode: config.posAutCode,
    correlation: config.correlation ?? null,
    expectedPayment: config.expectedPayment ?? null,
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
    appKey,
    baseUrl: config.baseUrl ?? '',
    basePath: config.basePath ?? '/sisp',
    generators: {
      merchantReference:
        config.generators?.merchantReference ?? (() => generateMerchantReference()),
      merchantSession: config.generators?.merchantSession ?? (() => generateMerchantSession()),
      timeStamp: config.generators?.timeStamp ?? (() => generateTimeStamp()),
    },
    paymentValidation: resolvePaymentValidation(config.paymentValidation, config.currency ?? '132'),
    pipelines: config.pipelines ?? {},
    onEventListenerError: config.onEventListenerError ?? null,
    transactionStatus: { ...DEFAULT_TRANSACTION_STATUS, ...config.transactionStatus },
  };
}
