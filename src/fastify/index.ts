import formbody from '@fastify/formbody';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import qs from 'qs';
import type { HttpRequestInfo } from '../http/request-info';
import type { HttpResult } from '../http/results';
import type { Sisp } from '../sisp';

export interface SispFastifyOptions {
  sisp: Sisp;
  authorizeRefund?: (request: FastifyRequest) => boolean | Promise<boolean>;
}

export async function sispFastifyPlugin(
  fastify: FastifyInstance,
  options: SispFastifyOptions,
): Promise<void> {
  const { sisp } = options;
  const authorizeRefund = options.authorizeRefund ?? (() => false);

  await fastify.register(formbody, {
    parser: (body) => qs.parse(body) as Record<string, unknown>,
  });

  const route = (handler: (request: HttpRequestInfo) => Promise<HttpResult>) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      send(reply, await handler(toRequestInfo(request)));
    };
  };

  fastify.post(
    '/payment',
    route((request) => sisp.handlers.handlePayment(request)),
  );
  fastify.get(
    '/callback',
    route((request) => sisp.handlers.handleCallback(request)),
  );
  fastify.post(
    '/callback',
    route((request) => sisp.handlers.handleCallback(request)),
  );
  fastify.get(
    '/retry-payment',
    route((request) => sisp.handlers.handleRetryPayment(request)),
  );
  fastify.post(
    '/retry-payment',
    route((request) => sisp.handlers.handleRetryPayment(request)),
  );
  fastify.get(
    '/cancel',
    route((request) => sisp.handlers.handleCancel(request)),
  );
  fastify.get(
    '/sandbox',
    route((request) => sisp.handlers.handleSandbox(request)),
  );
  fastify.post(
    '/sandbox',
    route((request) => sisp.handlers.handleSandbox(request)),
  );
  fastify.get(
    '/countries',
    route(() => Promise.resolve(sisp.handlers.handleCountries())),
  );

  fastify.post('/refund/:transaction', async (request, reply) => {
    if (!(await authorizeRefund(request))) {
      reply.status(403).send({
        success: false,
        message: 'Unauthorized to refund this transaction.',
      });

      return;
    }

    const { transaction } = request.params as { transaction: string };

    send(reply, await sisp.handlers.handleRefund(toRequestInfo(request), Number(transaction)));
  });
}

function toRequestInfo(request: FastifyRequest): HttpRequestInfo {
  return {
    ip: request.ip,
    method: request.method,
    path: request.url.split('?')[0] ?? request.url,
    headers: request.headers,
    query: (request.query ?? {}) as Record<string, unknown>,
    body: isRecord(request.body) ? request.body : {},
  };
}

function send(reply: FastifyReply, result: HttpResult): void {
  if (result.type === 'redirect') {
    reply.redirect(result.location);

    return;
  }

  if (result.type === 'html') {
    reply.status(result.status).type('text/html').send(result.html);

    return;
  }

  reply.status(result.status).send(result.data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
