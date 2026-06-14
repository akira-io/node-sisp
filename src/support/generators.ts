export function generateMerchantReference(date: Date = new Date()): string {
  return `R${formatCompactTimestamp(date)}`;
}

export function generateMerchantSession(date: Date = new Date()): string {
  return `S${formatCompactTimestamp(date)}`;
}

export function generateTimeStamp(date: Date = new Date()): string {
  return formatSispTimestamp(date);
}

export function formatCompactTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function formatSispTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
