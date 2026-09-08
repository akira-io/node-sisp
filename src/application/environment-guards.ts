import { SispError } from '../domain/errors/exceptions';

const MIN_APP_KEY_LENGTH = 32;

export function assertSafeEnvironment(
  sandbox: boolean,
  allowSandboxInProduction: boolean,
  appKey: string | null,
  allowWeakAppKey = false,
): void {
  if (sandbox && !allowSandboxInProduction && process.env.NODE_ENV === 'production') {
    throw new SispError(
      'SISP sandbox mode is disabled when NODE_ENV is production. Set allowSandboxInProduction: true to override.',
    );
  }

  if (
    !sandbox &&
    !allowWeakAppKey &&
    appKey !== null &&
    appKey !== '' &&
    appKey.length < MIN_APP_KEY_LENGTH
  ) {
    throw new SispError(
      `SISP appKey must be at least ${MIN_APP_KEY_LENGTH} characters outside sandbox mode. Set allowWeakAppKey: true until the key is rotated.`,
    );
  }
}
