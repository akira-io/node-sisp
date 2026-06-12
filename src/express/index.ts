import { json, Router, urlencoded, type Request, type RequestHandler, type Response } from 'express';
import type { HttpRequestInfo } from '../http/request-info';
import type { HttpResult } from '../http/results';
import type { Sisp } from '../sisp';

export interface SispRoutesOptions {
  authorizeRefund?: (req: Request) => boolean | Promise<boolean>;
}

export function sispRoutes(sisp: Sisp, options: SispRoutesOptions = {}): Router {
  const router = Router();
  const authorizeRefund = options.authorizeRefund ?? (() => false);

  router.use(urlencoded({ extended: true }));
  router.use(json());

  router.post('/payment', handle((request) => sisp.handlers.handlePayment(request)));
  router.get('/callback', handle((request) => sisp.handlers.handleCallback(request)));
  router.post('/callback', handle((request) => sisp.handlers.handleCallback(request)));
  router.get('/retry-payment', handle((request) => sisp.handlers.handleRetryPayment(request)));
  router.post('/retry-payment', handle((request) => sisp.handlers.handleRetryPayment(request)));
  router.get('/cancel', handle((request) => sisp.handlers.handleCancel(request)));
  router.get('/sandbox', handle((request) => sisp.handlers.handleSandbox(request)));
  router.post('/sandbox', handle((request) => sisp.handlers.handleSandbox(request)));
  router.get('/countries', handle(() => Promise.resolve(sisp.handlers.handleCountries())));

  router.post('/refund/:transaction', (req, res, next) => {
    Promise.resolve(authorizeRefund(req))
      .then((authorized) => {
        if (!authorized) {
          res.status(403).json({
            success: false,
            message: 'Unauthorized to refund this transaction.',
          });

          return;
        }

        return sisp.handlers
          .handleRefund(toRequestInfo(req), Number(req.params.transaction))
          .then((result) => send(res, result));
      })
      .catch(next);
  });

  return router;
}

function handle(handler: (request: HttpRequestInfo) => Promise<HttpResult>): RequestHandler {
  return (req, res, next) => {
    handler(toRequestInfo(req))
      .then((result) => send(res, result))
      .catch(next);
  };
}

function toRequestInfo(req: Request): HttpRequestInfo {
  return {
    ip: req.ip ?? '',
    method: req.method,
    path: req.originalUrl.split('?')[0] ?? req.path,
    headers: req.headers,
    query: req.query as Record<string, unknown>,
    body: isRecord(req.body) ? req.body : {},
  };
}

function send(res: Response, result: HttpResult): void {
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
