const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function toThousandths(amount: number | string): number {
  const decimal = decimalString(amount);

  if (decimal === null) {
    return phpRound(floatValue(amount) * 1000);
  }

  return decimalStringToThousandths(decimal);
}

export function toCents(amount: number | string): number {
  return phpRound(toThousandths(amount) / 10);
}

export function fromCents(cents: number | string): number {
  const parsed = Number(cents);

  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function phpRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function floatValue(amount: number | string): number {
  if (typeof amount === 'number') {
    return amount;
  }

  const parsed = Number.parseFloat(amount);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function decimalString(amount: number | string): string | null {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      return null;
    }

    return Number.isInteger(amount) ? String(amount) : amount.toFixed(10);
  }

  const decimal = amount.trim();

  if (decimal === '') {
    return null;
  }

  return DECIMAL_PATTERN.test(decimal) ? decimal : null;
}

function decimalStringToThousandths(decimal: string): number {
  let sign = 1;
  let value = decimal;

  if (value.startsWith('-')) {
    sign = -1;
    value = value.slice(1);
  }

  if (value.startsWith('+')) {
    value = value.slice(1);
  }

  const dotIndex = value.indexOf('.');
  const unitsPart = dotIndex === -1 ? value : value.slice(0, dotIndex);
  const fractionPart = dotIndex === -1 ? '' : value.slice(dotIndex + 1);

  const units = unitsPart === '' ? '0' : unitsPart;
  const fraction = fractionPart.padEnd(4, '0');

  let thousandths = Number.parseInt(units, 10) * 1000 + Number.parseInt(fraction.slice(0, 3), 10);

  if (Number.parseInt(fraction.charAt(3), 10) >= 5) {
    thousandths += 1;
  }

  return sign * thousandths;
}
