import type { Request, Response } from 'express';
import type { HttpRequestInfo } from '../http/request-info';
import type { HttpResult } from '../http/results';

export function toRequestInfo(req: Request): HttpRequestInfo {
  return {
    ip: req.ip ?? '',
    method: req.method,
    path: req.originalUrl.split('?')[0] ?? req.path,
    headers: req.headers,
    query: req.query as Record<string, unknown>,
    body: isRecord(req.body) ? req.body : {},
  };
}

export function send(res: Response, result: HttpResult): void {
  if (result.type === 'redirect') {
    res.redirect(result.location);

    return;
  }

  if (result.type === 'html') {
    res.status(result.status).type('html').send(result.html);

    return;
  }

  res.status(result.status).json(result.data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
