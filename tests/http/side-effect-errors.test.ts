import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSisp } from '../../src/application/create-sisp';
import type { Sisp } from '../../src/application/sisp';
import { requireKnex } from '../helpers/knex';
import {
  createSideEffectSisp,
  paymentRequest,
  sideEffectConfig,
} from '../helpers/side-effect-sisp';

let sisp: Sisp | null = null;

afterEach(async () => {
  await sisp?.destroy();
  sisp = null;
});

describe('payment pipeline side effect errors', () => {
  it('keeps onEventListenerError for listener failures only', async () => {
    const onListenerError = vi.fn();
    const onSideEffectError = vi.fn();
    sisp = await createSisp({
      ...sideEffectConfig(onSideEffectError),
      onEventListenerError: onListenerError,
    });

    sisp.on('payment:pending', () => {
      throw new Error('listener exploded');
    });

    await requireKnex(sisp).schema.dropTable(sisp.config.tables.invoices);

    const response = await sisp.handlers.handlePayment(paymentRequest());

    expect(response.type).toBe('html');
    expect(onSideEffectError).toHaveBeenCalledWith('create_invoice_stub', expect.any(Error));
    expect(onListenerError).not.toHaveBeenCalledWith('create_invoice_stub', expect.any(Error));
  });

  it('reports invoice stub failures without breaking payment creation', async () => {
    const onError = vi.fn();
    sisp = await createSideEffectSisp(onError);

    await requireKnex(sisp).schema.dropTable(sisp.config.tables.invoices);

    const response = await sisp.handlers.handlePayment(paymentRequest());

    expect(response.type).toBe('html');
    expect(onError).toHaveBeenCalledWith('create_invoice_stub', expect.any(Error));
  });

  it('does not let a throwing error handler halt the payment pipeline', async () => {
    const onError = vi.fn(() => {
      throw new Error('handler exploded');
    });
    sisp = await createSideEffectSisp(onError);

    await requireKnex(sisp).schema.dropTable(sisp.config.tables.invoices);

    const response = await sisp.handlers.handlePayment(paymentRequest());

    expect(response.type).toBe('html');
    expect(onError).toHaveBeenCalledWith('create_invoice_stub', expect.any(Error));
  });
});
