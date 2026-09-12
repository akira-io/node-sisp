import { randomInt } from 'node:crypto';
import type { CredentialsResolver } from '../core/contracts/credentials-resolver';
import { MessageType } from '../domain/enums/message-type';
import {
  type CallbackPayload,
  callbackPayloadFrom,
} from '../domain/value-objects/callback-payload';
import type { PaymentRequestData } from '../domain/value-objects/payment-request-data';
import { generateCallbackFingerprint } from '../infrastructure/fingerprints/callback-fingerprint';
import { computeToken } from '../infrastructure/fingerprints/token';
import type { ResolvedSharedConfig } from './config';

type ResolvedCredentials = ReturnType<CredentialsResolver['resolve']>;

export type SandboxStatus = 'success' | 'failed' | (string & {});

const ROUTE_ONLY_STATUSES = ['cancelled', 'tampered'];

export interface SandboxErrorOverrides {
  readonly errorCode?: string;
  readonly errorDescription?: string;
  readonly errorDetail?: string;
  readonly additionalErrorMessage?: string;
}

export const OBSERVED_SANDBOX_DECLINE = Object.freeze({
  errorCode: 'F',
  errorDescription: 'FALHA NA AUTENTICACAO CLIENTE',
  errorDetail: 'FALHA NA AUTENTICACAO CLIENTE',
  additionalErrorMessage: 'FALHA NA AUTENTICACAO CLIENTE',
});

export class BuildSandboxPayloadAction {
  constructor(
    private readonly config: ResolvedSharedConfig,
    private readonly credentialsResolver: CredentialsResolver,
  ) {}

  handle(
    data: PaymentRequestData,
    status: SandboxStatus = 'success',
    errorOverrides: SandboxErrorOverrides = {},
  ): CallbackPayload {
    const credentials = this.credentialsResolver.resolve();

    if (!credentials.sandbox) {
      throw new Error('Sandbox payloads can only be generated when SISP sandbox mode is enabled.');
    }

    if (ROUTE_ONLY_STATUSES.includes(status)) {
      throw new Error(
        `The ${status} outcome is built by the sandbox route, not by a callback payload.`,
      );
    }

    const identifiers: CallbackIdentifiers = {
      merchantRef: data.merchantRef ?? this.config.generators.merchantReference(),
      merchantSession: data.merchantSession ?? this.config.generators.merchantSession(),
      timeStamp: data.timeStamp ?? this.config.generators.timeStamp(),
    };

    const post =
      status === 'failed'
        ? errorPost(identifiers, credentials.fingerprintVersion, errorOverrides)
        : successPost(identifiers, data, credentials, this.config, successMessageTypeFor(status));

    const fingerprint = generateCallbackFingerprint(
      computeToken(credentials.posAutCode),
      callbackPayloadFrom(post),
    );

    return callbackPayloadFrom({ ...post, resultFingerPrint: fingerprint });
  }
}

interface CallbackIdentifiers {
  merchantRef: string;
  merchantSession: string;
  timeStamp: string;
}

function successMessageTypeFor(status: SandboxStatus): string {
  return status === 'success' ? MessageType.Purchase : MessageType.ServicePayment;
}

function errorPost(
  identifiers: CallbackIdentifiers,
  fingerprintVersion: string,
  overrides: SandboxErrorOverrides,
): Record<string, unknown> {
  return {
    messageType: MessageType.Error,
    merchantRespMessageID: `MSG-${randomToken(8)}`,
    merchantRespErrorCode: overrides.errorCode ?? OBSERVED_SANDBOX_DECLINE.errorCode,
    merchantRespErrorDetail: overrides.errorDetail ?? OBSERVED_SANDBOX_DECLINE.errorDetail,
    merchantRespErrorDescription:
      overrides.errorDescription ?? OBSERVED_SANDBOX_DECLINE.errorDescription,
    merchantRespMerchantRef: identifiers.merchantRef,
    merchantRespMerchantSession: identifiers.merchantSession,
    merchantRespAdditionalErrorMessage:
      overrides.additionalErrorMessage ?? OBSERVED_SANDBOX_DECLINE.additionalErrorMessage,
    merchantRespTimeStamp: identifiers.timeStamp,
    languageMessages: 'EN',
    resultFingerPrintVersion: fingerprintVersion,
  };
}

function successPost(
  identifiers: CallbackIdentifiers,
  data: PaymentRequestData,
  credentials: ResolvedCredentials,
  config: ResolvedSharedConfig,
  messageType: string,
): Record<string, unknown> {
  return {
    messageType,
    merchantRespCP: '01',
    merchantRespTid: `FAKE${randomToken(8)}`,
    merchantRespMerchantRef: identifiers.merchantRef,
    merchantRespMerchantSession: identifiers.merchantSession,
    merchantRespPurchaseAmount: data.amount,
    merchantRespMessageID: `MSG-${randomToken(8)}`,
    merchantRespPan: '****-****-****-1234',
    merchantResp: '00',
    merchantRespTimeStamp: identifiers.timeStamp,
    merchantRespReferenceNumber: randomToken(12),
    merchantRespEntityCode: '10010',
    merchantRespClientReceipt: `RECEIPT-${randomToken(8)}`,
    merchantRespAdditionalErrorMessage: '',
    posID: credentials.posId,
    currency: data.currency ?? credentials.currency,
    transactionCode: data.transactionCode ?? config.transactionCode,
  };
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(length: number): string {
  let token = '';

  for (let index = 0; index < length; index += 1) {
    token += TOKEN_ALPHABET.charAt(randomInt(TOKEN_ALPHABET.length));
  }

  return token;
}
