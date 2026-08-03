import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import { createStatelessSisp } from '../../src/application/create-stateless-sisp';
import type { CallbackEvent } from '../../src/application/events';
import type { StatelessSisp } from '../../src/application/stateless-sisp';
import { sispRoutes, statelessSispRoutes } from '../../src/presentation/express';
import { extractForm } from '../helpers/auto-submit-form';
import { InMemoryPaymentCorrelationStore } from '../stateless/in-memory-correlation-store';

const paymentBody = {
  amount: '1500',
  customer_name: 'Kid',
  customer_email: 'kid@akira.cv',
  'items[0][product_name]': 'Plano Pro',
  'items[0][quantity]': '2',
  'items[0][unit_price]': '750',
  'items[0][total_price]': '1500',
};

function pathAndQuery(action: string): string {
  return action.startsWith('http') ? action.replace(/^https?:\/\/[^/]+/, '') : action;
}

async function completedCallbackForm(
  app: express.Express,
): Promise<Record<string, string | number>> {
  const paymentResponse = await request(app)
    .post('/sisp/payment')
    .type('form')
    .send(paymentBody)
    .expect(200);

  const paymentForm = extractForm(paymentResponse.text);

  const sandboxResponse = await request(app)
    .post(pathAndQuery(paymentForm.action))
    .type('form')
    .send(paymentForm.fields)
    .expect(200);

  return extractForm(sandboxResponse.text).fields;
}

describe('POST /sisp/callback route emits callback:verified', () => {
  it('emits exactly one callback:verified in stateless mode', async () => {
    const correlation = new InMemoryPaymentCorrelationStore();
    const sisp: StatelessSisp = createStatelessSisp({
      posId: '90000045',
      posAutCode: 'code',
      sandbox: true,
      appKey: 'app-key',
      baseUrl: 'https://shop.test',
      correlation,
    });
    const seen: CallbackEvent[] = [];

    sisp.on('callback:verified', (event) => seen.push(event));

    const app = express();

    app.use('/sisp', statelessSispRoutes(sisp));

    const callbackFields = await completedCallbackForm(app);

    await request(app).post('/sisp/callback').type('form').send(callbackFields).expect(302);

    expect(seen).toHaveLength(1);
  });

  it('emits exactly one callback:verified in stateful mode', async () => {
    const sisp = await createSisp({
      posId: '90051',
      posAutCode: 'TEST_POS_AUT_CODE',
      sandbox: true,
      appKey: 'app-key',
      database: { client: 'better-sqlite3', connection: { filename: ':memory:' } },
    });

    try {
      const seen: CallbackEvent[] = [];

      sisp.on('callback:verified', (event) => seen.push(event));

      const app = express();

      app.use('/sisp', sispRoutes(sisp));

      const callbackFields = await completedCallbackForm(app);

      await request(app).post('/sisp/callback').type('form').send(callbackFields).expect(302);

      expect(seen).toHaveLength(1);
    } finally {
      await sisp.destroy();
    }
  });
});
