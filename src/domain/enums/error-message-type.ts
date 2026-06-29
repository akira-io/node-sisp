import { ERROR_MESSAGE_TYPE_DEFINITIONS } from './error-message-types.generated';
import { type MessageLanguage, normalizeLanguage } from './language';
import { MESSAGE_TRANSLATIONS } from './translations.generated';

type ErrorDefinition = (typeof ERROR_MESSAGE_TYPE_DEFINITIONS)[number];

export type ErrorMessageTypeKey = ErrorDefinition['key'];
export type ErrorMessageTypeValue = ErrorDefinition['value'];
export type ErrorCategory = ErrorDefinition['category'];
export type ErrorAction = ErrorDefinition['action'];

export interface ErrorMessageType {
  key: ErrorMessageTypeKey;
  value: ErrorMessageTypeValue;
  category: ErrorCategory;
  action: ErrorAction;
}

export const ERROR_MESSAGE_TYPE_VALUES: readonly string[] = ERROR_MESSAGE_TYPE_DEFINITIONS.map(
  (definition) => definition.value,
);

export function errorMessageTypeFromValue(value: string): ErrorMessageType | null {
  const definition = ERROR_MESSAGE_TYPE_DEFINITIONS.find((entry) => entry.value === value);

  return definition ? { ...definition } : null;
}

export function errorMessageTypeLabel(
  type: ErrorMessageType,
  language: MessageLanguage | string = 'en',
): string {
  return MESSAGE_TRANSLATIONS[normalizeLanguage(language)].errors.labels[type.key];
}

export function errorCategoryLabel(
  type: ErrorMessageType,
  language: MessageLanguage | string = 'en',
): string {
  return MESSAGE_TRANSLATIONS[normalizeLanguage(language)].errors.categories[type.category];
}

export function errorActionLabel(
  type: ErrorMessageType,
  language: MessageLanguage | string = 'en',
): string {
  return MESSAGE_TRANSLATIONS[normalizeLanguage(language)].errors.actions[type.action];
}
