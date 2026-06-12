import { MESSAGE_TRANSLATIONS } from './translations.generated';

export type MessageLanguage = keyof typeof MESSAGE_TRANSLATIONS;

export function normalizeLanguage(language: string): MessageLanguage {
  const normalized = language.toLowerCase();

  return normalized in MESSAGE_TRANSLATIONS ? (normalized as MessageLanguage) : 'en';
}
