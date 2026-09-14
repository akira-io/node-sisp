import {
  RetentionWindowInvalidError,
  RetentionWindowRequiredError,
  SispError,
} from '../domain/errors/exceptions';

export const MAX_BATCH = 999;

export function resolveBatch(batch: number | undefined, fallback: number, method: string): number {
  if (batch === undefined) {
    return fallback;
  }

  if (!Number.isInteger(batch) || batch < 1 || batch > MAX_BATCH) {
    throw new SispError(
      `${method} expects batch to be an integer between 1 and ${MAX_BATCH}, received ${batch}.`,
    );
  }

  return batch;
}

export function resolveRetentionDays(days: number | null | undefined): number {
  if (days === null || days === undefined) {
    throw new RetentionWindowRequiredError();
  }

  if (!Number.isInteger(days) || days < 0) {
    throw new RetentionWindowInvalidError(days);
  }

  return days;
}
