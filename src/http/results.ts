export type HttpResult =
  | { type: 'html'; status: number; html: string }
  | { type: 'json'; status: number; data: unknown }
  | { type: 'redirect'; location: string };

export function html(content: string, status = 200): HttpResult {
  return { type: 'html', status, html: content };
}

export function json(data: unknown, status = 200): HttpResult {
  return { type: 'json', status, data };
}

export function redirect(location: string): HttpResult {
  return { type: 'redirect', location };
}
