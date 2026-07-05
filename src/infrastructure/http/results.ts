export type HttpHeaders = Record<string, string>;

export type HttpResult =
  | { type: 'html'; status: number; html: string; headers: HttpHeaders }
  | { type: 'json'; status: number; data: unknown }
  | { type: 'redirect'; location: string };

export function html(content: string, status = 200, headers = autoSubmitHeaders()): HttpResult {
  return { type: 'html', status, html: content, headers };
}

export function json(data: unknown, status = 200): HttpResult {
  return { type: 'json', status, data };
}

export function redirect(location: string): HttpResult {
  return { type: 'redirect', location };
}

function autoSubmitHeaders(): HttpHeaders {
  return {
    'Content-Security-Policy':
      "default-src 'none'; base-uri 'none'; form-action 'self' http: https:; frame-ancestors 'none'; script-src 'unsafe-inline'",
    'X-Frame-Options': 'DENY',
  };
}
