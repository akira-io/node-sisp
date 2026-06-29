export interface HttpRequestInfo {
  ip: string;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
}

export function headerValue(request: HttpRequestInfo, name: string): string | null {
  const value = request.headers[name.toLowerCase()] ?? request.headers[name];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
