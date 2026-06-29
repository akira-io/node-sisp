const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const MAX_SAFE_THOUSANDTHS = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_THOUSANDTHS = BigInt(Number.MIN_SAFE_INTEGER);

export function toThousandths(amount: number | string): number {
  return decimalStringToThousandths(decimalString(amount));
}

export function toCents(amount: number | string): number {
  return phpRound(toThousandths(amount) / 10);
}

function phpRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function decimalString(amount: number | string): string {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw invalidAmountError();
    }

    return Number.isInteger(amount) ? String(amount) : amount.toFixed(10);
  }

  const decimal = amount.trim();

  if (decimal === '' || !DECIMAL_PATTERN.test(decimal)) {
    throw invalidAmountError();
  }

  return decimal;
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

  let thousandths = BigInt(units) * 1000n + BigInt(fraction.slice(0, 3));

  if (Number.parseInt(fraction.charAt(3), 10) >= 5) {
    thousandths += 1n;
  }

  const signedThousandths = sign === -1 ? -thousandths : thousandths;

  if (signedThousandths > MAX_SAFE_THOUSANDTHS || signedThousandths < MIN_SAFE_THOUSANDTHS) {
    throw new RangeError('SISP amount exceeds the supported range.');
  }

  return Number(signedThousandths);
}

function invalidAmountError(): TypeError {
  return new TypeError('Invalid SISP amount. Use a dot as the decimal separator.');
}
