import { json, type Request, type RequestHandler, Router, urlencoded } from 'express';
import type { Sisp } from '../../application/sisp';
import type { StatelessSisp } from '../../application/stateless-sisp';
import type { HttpRequestInfo } from '../../infrastructure/http/request-info';
import type { HttpResult } from '../../infrastructure/http/results';
import { send, toRequestInfo } from './bridge';

export interface SispRoutesOptions {
  authorizeRefund?: (req: Request) => boolean | Promise<boolean>;
  authorizeTransactionStatus?: (req: Request) => boolean | Promise<boolean>;
}

export function sispRoutes(sisp: Sisp, options: SispRoutesOptions = {}): Router {
  const router = Router();
  const authorizeRefund = options.authorizeRefund ?? (() => false);
  const authorizeTransactionStatus = options.authorizeTransactionStatus ?? (() => true);

  router.use(urlencoded({ extended: true }));
  router.use(json());

  router.post(
    '/payment',
    handle((request) => sisp.handlers.handlePayment(request)),
  );
  router.post(
    '/payment/intent',
    handle((request) => sisp.handlers.handlePaymentIntent(request)),
  );
  router.get(
    '/callback',
    handle((request) => sisp.handlers.handleCallback(request)),
  );
  router.post(
    '/callback',
    handle((request) => sisp.handlers.handleCallback(request)),
  );
  router.get(
    '/retry-payment',
    handle((request) => sisp.handlers.handleRetryPayment(request)),
  );
  router.post(
    '/retry-payment',
    handle((request) => sisp.handlers.handleRetryPayment(request)),
  );
  router.get(
    '/cancel',
    handle((request) => sisp.handlers.handleCancel(request)),
  );
  router.get(
    '/sandbox',
    handle((request) => sisp.handlers.handleSandbox(request)),
  );
  router.post(
    '/sandbox',
    handle((request) => sisp.handlers.handleSandbox(request)),
  );
  router.get(
    '/countries',
    handle(() => Promise.resolve(sisp.handlers.handleCountries())),
  );

  router.get('/transactions/:ref', (req, res, next) => {
    sisp.handlers
      .handleTransactionStatus(toRequestInfo(req), req.params.ref, () =>
        authorizeTransactionStatus(req),
      )
      .then((result) => send(res, result))
      .catch(next);
  });

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

export function statelessSispRoutes(sisp: StatelessSisp): Router {
  const router = Router();

  router.use(urlencoded({ extended: true }));
  router.use(json());

  if (sisp.correlationConfigured) {
    router.post(
      '/payment',
      handle((request) => sisp.handlers.handlePayment(request)),
    );
    router.post(
      '/payment/intent',
      handle((request) => sisp.handlers.handlePaymentIntent(request)),
    );
  }

  router.post(
    '/callback',
    handle((request) => sisp.handlers.handleCallback(request)),
  );

  if (sisp.config.appKey !== null && sisp.config.appKey !== '') {
    router.get(
      '/callback',
      handle((request) => sisp.handlers.handleCallback(request)),
    );
  }

  if (sisp.config.sandbox) {
    router.get(
      '/sandbox',
      handle((request) => sisp.handlers.handleSandbox(request)),
    );
    router.post(
      '/sandbox',
      handle((request) => sisp.handlers.handleSandbox(request)),
    );
  }

  router.get(
    '/countries',
    handle(() => Promise.resolve(sisp.handlers.handleCountries())),
  );

  return router;
}

function handle(handler: (request: HttpRequestInfo) => Promise<HttpResult>): RequestHandler {
  return (req, res, next) => {
    handler(toRequestInfo(req))
      .then((result) => send(res, result))
      .catch(next);
  };
}
