import { SUCCESS_MESSAGE_TYPE_DEFINITIONS } from './error-message-types.generated';
import { type MessageLanguage, normalizeLanguage } from './language';
import { MESSAGE_TRANSLATIONS } from './translations.generated';

type SuccessDefinition = (typeof SUCCESS_MESSAGE_TYPE_DEFINITIONS)[number];

export type SuccessMessageTypeKey = SuccessDefinition['key'];
export type SuccessMessageTypeValue = SuccessDefinition['value'];

export interface SuccessMessageType {
  key: SuccessMessageTypeKey;
  value: SuccessMessageTypeValue;
}

export const SUCCESS_MESSAGE_TYPE_VALUES: readonly string[] = SUCCESS_MESSAGE_TYPE_DEFINITIONS.map(
  (definition) => definition.value,
);

export function successMessageTypeFromValue(value: string): SuccessMessageType | null {
  const definition = SUCCESS_MESSAGE_TYPE_DEFINITIONS.find((entry) => entry.value === value);

  return definition ? { key: definition.key, value: definition.value } : null;
}

export function successMessageTypeLabel(
  type: SuccessMessageType,
  language: MessageLanguage | string = 'en',
): string {
  return MESSAGE_TRANSLATIONS[normalizeLanguage(language)].success.labels[type.key];
}
