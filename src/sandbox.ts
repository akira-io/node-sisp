import { randomInt } from 'node:crypto';
import type { ResolvedSispConfig } from './config';
import type { CredentialsResolver } from './contracts/credentials-resolver';
import { generateCallbackFingerprint } from './fingerprints/callback-fingerprint';
import { computeToken } from './fingerprints/token';
import { type CallbackPayload, callbackPayloadFrom } from './value-objects/callback-payload';
import type { PaymentRequestData } from './value-objects/payment-request-data';

export type SandboxStatus = 'success' | 'failed' | (string & {});

export class BuildSandboxPayloadAction {
  constructor(
    private readonly config: ResolvedSispConfig,
    private readonly credentialsResolver: CredentialsResolver,
  ) {}

  handle(data: PaymentRequestData, status: SandboxStatus = 'success'): CallbackPayload {
    const credentials = this.credentialsResolver.resolve();

    if (!credentials.sandbox) {
      throw new Error('Sandbox payloads can only be generated when SISP sandbox mode is enabled.');
    }

    const post: Record<string, unknown> = {
      messageType: messageTypeFor(status),
      merchantRespCP: '01',
      merchantRespTid: `FAKE${randomToken(8)}`,
      merchantRespMerchantRef: data.merchantRef ?? this.config.generators.merchantReference(),
      merchantRespMerchantSession: data.merchantSession ?? this.config.generators.merchantSession(),
      merchantRespPurchaseAmount: data.amount,
      merchantRespMessageID: `MSG-${randomToken(8)}`,
      merchantRespPan: '****-****-****-1234',
      merchantResp: '00',
      merchantRespTimeStamp: data.timeStamp ?? this.config.generators.timeStamp(),
      merchantRespReferenceNumber: randomToken(12),
      merchantRespEntityCode: '10010',
      merchantRespClientReceipt: `RECEIPT-${randomToken(8)}`,
      merchantRespAdditionalErrorMessage: status === 'failed' ? 'Sandbox transaction failed' : '',
      posID: credentials.posId,
      currency: data.currency ?? credentials.currency,
      transactionCode: data.transactionCode ?? this.config.transactionCode,
    };

    const fingerprint = generateCallbackFingerprint(
      computeToken(credentials.posAutCode),
      callbackPayloadFrom(post),
    );

    return callbackPayloadFrom({ ...post, resultFingerPrint: fingerprint });
  }
}

function messageTypeFor(status: SandboxStatus): string {
  if (status === 'success') {
    return '8';
  }

  if (status === 'failed') {
    return '6';
  }

  return 'P';
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(length: number): string {
  let token = '';

  for (let index = 0; index < length; index += 1) {
    token += TOKEN_ALPHABET.charAt(randomInt(TOKEN_ALPHABET.length));
  }

  return token;
}
