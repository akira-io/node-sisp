export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.host !== '';
  } catch {
    return false;
  }
}

export function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}
